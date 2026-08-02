import assert from "assert";
import * as sinon from "sinon";
import sinonTest from "sinon-test";
import { mainWindow } from "../../../../base/browser/window.js";
import * as Errors from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import product from "../../../product/common/product.js";
import ErrorTelemetry from "../../browser/errorTelemetry.js";
import { TelemetryConfiguration, TelemetryLevel } from "../../common/telemetry.js";
import { TelemetryService } from "../../common/telemetryService.js";
import { NullAppender } from "../../common/telemetryUtils.js";
const sinonTestFn = sinonTest(sinon);
class TestTelemetryAppender {
  constructor() {
    this.events = [];
    this.isDisposed = false;
  }
  log(eventName, data) {
    this.events.push({ eventName, data });
  }
  getEventsCount() {
    return this.events.length;
  }
  flush() {
    this.isDisposed = true;
    return Promise.resolve(null);
  }
}
class ErrorTestingSettings {
  constructor() {
    this.randomUserFile = "a/path/that/doe_snt/con-tain/code/names.js";
    this.anonymizedRandomUserFile = "<REDACTED: user-file-path>";
    this.nodeModulePathToRetain = "node_modules/path/that/shouldbe/retained/names.js:14:15854";
    this.anonymizedNodeModulePath = "<REDACTED: user-file-path>/node_modules/path/that/shouldbe/retained/names.js:14:15854";
    this.nodeModuleAsarPathToRetain = "node_modules.asar/path/that/shouldbe/retained/names.js:14:12354";
    this.anonymizedNodeModuleAsarPath = "<REDACTED: user-file-path>/node_modules.asar/path/that/shouldbe/retained/names.js:14:12354";
    this.fullNodeModulePath = "/Users/username/projects/vscode/node_modules/@xterm/xterm/lib/xterm.js:1:243732";
    this.anonymizedFullNodeModulePath = "<REDACTED: user-file-path>/node_modules/@xterm/xterm/lib/xterm.js:1:243732";
    this.fullNodeModuleAsarPath = "/Users/username/projects/vscode/node_modules.asar/@xterm/xterm/lib/xterm.js:1:376066";
    this.anonymizedFullNodeModuleAsarPath = "<REDACTED: user-file-path>/node_modules.asar/@xterm/xterm/lib/xterm.js:1:376066";
    this.extensionPathToRetain = ".vscode/extensions/ms-python.python-2024.0.1/out/extension.js:144:145516";
    this.fullExtensionPath = "/Users/username/.vscode/extensions/ms-python.python-2024.0.1/out/extension.js:144:145516";
    this.anonymizedExtensionPath = "<REDACTED: user-file-path>/.vscode/extensions/ms-python.python-2024.0.1/out/extension.js:144:145516";
    this.serverInsidersExtensionPathToRetain = ".vscode-server-insiders/extensions/ms-vscode.remote-server-2024.1.0/out/server.js:99:8888";
    this.fullServerInsidersExtensionPath = "/home/user/.vscode-server-insiders/extensions/ms-vscode.remote-server-2024.1.0/out/server.js:99:8888";
    this.anonymizedServerInsidersExtensionPath = "<REDACTED: user-file-path>/.vscode-server-insiders/extensions/ms-vscode.remote-server-2024.1.0/out/server.js:99:8888";
    this.builtinExtensionPathToRetain = "Resources/app/extensions/git/out/git.js:42:1234";
    this.fullBuiltinExtensionPath = "/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/git/out/git.js:42:1234";
    this.anonymizedBuiltinExtensionPath = "<REDACTED: user-file-path>/Resources/app/extensions/git/out/git.js:42:1234";
    this.personalInfo = "DANGEROUS/PATH";
    this.importantInfo = "important/information";
    this.filePrefix = "file:///";
    this.dangerousPathWithImportantInfo = this.filePrefix + this.personalInfo + "/resources/app/" + this.importantInfo;
    this.dangerousPathWithoutImportantInfo = this.filePrefix + this.personalInfo;
    this.missingModelPrefix = "Received model events for missing model ";
    this.missingModelMessage = this.missingModelPrefix + " " + this.dangerousPathWithoutImportantInfo;
    this.noSuchFilePrefix = "ENOENT: no such file or directory";
    this.noSuchFileMessage = this.noSuchFilePrefix + " '" + this.personalInfo + "'";
    this.stack = [
      `at e._modelEvents (${this.randomUserFile}:11:7309)`,
      `    at t.AllWorkers (${this.randomUserFile}:6:8844)`,
      `    at e.(anonymous function) [as _modelEvents] (${this.randomUserFile}:5:29552)`,
      `    at Function.<anonymous> (${this.randomUserFile}:6:8272)`,
      `    at e.dispatch (${this.randomUserFile}:5:26931)`,
      `    at e.request (/${this.nodeModuleAsarPathToRetain})`,
      `    at t._handleMessage (${this.nodeModuleAsarPathToRetain})`,
      `    at t._onmessage (/${this.nodeModulePathToRetain})`,
      `    at t.onmessage (${this.nodeModulePathToRetain})`,
      `    at get dimensions (${this.fullNodeModulePath})`,
      `    at _._refreshCanvasDimensions (${this.fullNodeModuleAsarPath})`,
      `    at uv.provideCodeActions (${this.fullExtensionPath})`,
      `    at remote.handleConnection (${this.fullServerInsidersExtensionPath})`,
      `    at git.getRepositoryState (${this.fullBuiltinExtensionPath})`,
      `    at DedicatedWorkerGlobalScope.self.onmessage`,
      this.dangerousPathWithImportantInfo,
      this.dangerousPathWithoutImportantInfo,
      this.missingModelMessage,
      this.noSuchFileMessage
    ];
  }
}
suite("TelemetryService", () => {
  const TestProductService = { _serviceBrand: void 0, ...product };
  test("Disposing", sinonTestFn(function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testPrivateEvent");
    assert.strictEqual(testAppender.getEventsCount(), 1);
    service.dispose();
    assert.strictEqual(!testAppender.isDisposed, true);
  }));
  test("Simple event", sinonTestFn(function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent");
    assert.strictEqual(testAppender.getEventsCount(), 1);
    assert.strictEqual(testAppender.events[0].eventName, "testEvent");
    assert.notStrictEqual(testAppender.events[0].data, null);
    service.dispose();
  }));
  test("Event with data", sinonTestFn(function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent", {
      "stringProp": "property",
      "numberProp": 1,
      "booleanProp": true,
      "complexProp": {
        "value": 0
      }
    });
    assert.strictEqual(testAppender.getEventsCount(), 1);
    assert.strictEqual(testAppender.events[0].eventName, "testEvent");
    assert.notStrictEqual(testAppender.events[0].data, null);
    assert.strictEqual(testAppender.events[0].data["stringProp"], "property");
    assert.strictEqual(testAppender.events[0].data["numberProp"], 1);
    assert.strictEqual(testAppender.events[0].data["booleanProp"], true);
    assert.strictEqual(testAppender.events[0].data["complexProp"].value, 0);
    service.dispose();
  }));
  test("common properties added to *all* events, simple event", function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({
      appenders: [testAppender],
      commonProperties: { foo: "JA!", get bar() {
        return Math.random() % 2 === 0;
      } }
    }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent");
    const [first] = testAppender.events;
    assert.strictEqual(Object.keys(first.data).length, 2);
    assert.strictEqual(typeof first.data["foo"], "string");
    assert.strictEqual(typeof first.data["bar"], "boolean");
    service.dispose();
  });
  test("common properties added to *all* events, event with data", function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({
      appenders: [testAppender],
      commonProperties: { foo: "JA!", get bar() {
        return Math.random() % 2 === 0;
      } }
    }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent", { hightower: "xl", price: 8e3 });
    const [first] = testAppender.events;
    assert.strictEqual(Object.keys(first.data).length, 4);
    assert.strictEqual(typeof first.data["foo"], "string");
    assert.strictEqual(typeof first.data["bar"], "boolean");
    assert.strictEqual(typeof first.data["hightower"], "string");
    assert.strictEqual(typeof first.data["price"], "number");
    service.dispose();
  });
  test("TelemetryInfo comes from properties", function() {
    const service = new TelemetryService({
      appenders: [NullAppender],
      commonProperties: {
        sessionID: "one",
        ["common.machineId"]: "three"
      }
    }, new TestConfigurationService(), TestProductService);
    assert.strictEqual(service.sessionId, "one");
    assert.strictEqual(service.machineId, "three");
    service.dispose();
  });
  test("setCommonProperty adds property to all subsequent events", function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({
      appenders: [testAppender]
    }, new TestConfigurationService(), TestProductService);
    service.publicLog("eventBeforeSet");
    service.setCommonProperty("common.copilotTrackingId", "test-tracking-id");
    service.publicLog("eventAfterSet");
    assert.strictEqual(testAppender.events[0].data["common.copilotTrackingId"], void 0);
    assert.strictEqual(testAppender.events[1].data["common.copilotTrackingId"], "test-tracking-id");
    service.dispose();
  });
  test("telemetry on by default", function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent");
    assert.strictEqual(testAppender.getEventsCount(), 1);
    assert.strictEqual(testAppender.events[0].eventName, "testEvent");
    service.dispose();
  });
  class TestErrorTelemetryService extends TelemetryService {
    constructor(config) {
      super({ ...config, sendErrorTelemetry: true }, new TestConfigurationService(), TestProductService);
    }
  }
  test("Error events", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const e = new Error("This is a test.");
      if (!e.stack) {
        e.stack = "blah";
      }
      Errors.onUnexpectedError(e);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      assert.strictEqual(testAppender.events[0].eventName, "UnhandledError");
      assert.strictEqual(testAppender.events[0].data.msg, "This is a test.");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Handle global errors", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const testError = new Error("test");
    mainWindow.onerror("Error Message", "file.js", 2, 42, testError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.alwaysCalledWithExactly("Error Message", "file.js", 2, 42, testError), true);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.getEventsCount(), 1);
    assert.strictEqual(testAppender.events[0].eventName, "UnhandledError");
    assert.strictEqual(testAppender.events[0].data.msg, "Error Message");
    assert.strictEqual(testAppender.events[0].data.file, "file.js");
    assert.strictEqual(testAppender.events[0].data.line, 2);
    assert.strictEqual(testAppender.events[0].data.column, 42);
    assert.strictEqual(testAppender.events[0].data.uncaught_error_msg, "test");
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Error Telemetry removes PII from filename with spaces", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const personInfoWithSpaces = settings.personalInfo.slice(0, 2) + " " + settings.personalInfo.slice(2);
    const dangerousFilenameError = new Error("dangerousFilename");
    dangerousFilenameError.stack = settings.stack;
    mainWindow.onerror("dangerousFilename", settings.dangerousPathWithImportantInfo.replace(settings.personalInfo, personInfoWithSpaces) + "/test.js", 2, 42, dangerousFilenameError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo.replace(settings.personalInfo, personInfoWithSpaces)), -1);
    assert.strictEqual(testAppender.events[0].data.file, settings.importantInfo + "/test.js");
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Uncaught Error Telemetry removes PII from filename", sinonTestFn(function() {
    const clock = this.clock;
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    let dangerousFilenameError = new Error("dangerousFilename");
    dangerousFilenameError.stack = settings.stack;
    mainWindow.onerror("dangerousFilename", settings.dangerousPathWithImportantInfo + "/test.js", 2, 42, dangerousFilenameError);
    clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo), -1);
    dangerousFilenameError = new Error("dangerousFilename");
    dangerousFilenameError.stack = settings.stack;
    mainWindow.onerror("dangerousFilename", settings.dangerousPathWithImportantInfo + "/test.js", 2, 42, dangerousFilenameError);
    clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 2);
    assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.file, settings.importantInfo + "/test.js");
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithoutImportantInfoError = new Error(settings.dangerousPathWithoutImportantInfo);
      dangerousPathWithoutImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithoutImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Unexpected Error Telemetry redacts only offending frames and preserves the rest of the callstack", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const stack = [
        "Error: Something failed",
        "    at StorageService.getStorageKey (out/vs/platform/storage/storage.js:1:200)",
        "    at Foo.run (out/vs/workbench/foo.js:3:40)",
        "    at Bar.baz (out/vs/workbench/bar.js:5:60)"
      ];
      const error = new Error("Something failed");
      error.stack = stack.join("\n");
      Errors.onUnexpectedError(error);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      const cs = testAppender.events[0].data.callstack;
      assert.notStrictEqual(cs, "<REDACTED: Generic Secret>", "Entire callstack should not be redacted");
      assert.strictEqual(cs.split("\n").length, stack.length, "All frames should be preserved");
      assert.notStrictEqual(cs.indexOf("Foo.run"), -1, "Non-offending frames should be preserved");
      assert.notStrictEqual(cs.indexOf("Bar.baz"), -1, "Non-offending frames should be preserved");
      assert.strictEqual(cs.indexOf("getStorageKey"), -1, "Offending frame should be redacted");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Unexpected Error Telemetry still redacts a frame whose trailing token relies on the newline delimiter", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const stack = [
        "Error: boom",
        "    at Service.getApiKey",
        "    at Foo.run (out/vs/workbench/foo.js:3:40)"
      ];
      const error = new Error("boom");
      error.stack = stack.join("\n");
      Errors.onUnexpectedError(error);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      const cs = testAppender.events[0].data.callstack;
      assert.strictEqual(cs.indexOf("getApiKey"), -1, "Trailing-token frame should still be redacted");
      assert.notStrictEqual(cs.indexOf("Foo.run"), -1, "Other frames should be preserved");
      assert.strictEqual(cs.split("\n").length, stack.length, "All frames should be preserved");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const dangerousPathWithoutImportantInfoError = new Error("dangerousPathWithoutImportantInfo");
    dangerousPathWithoutImportantInfoError.stack = settings.stack;
    mainWindow.onerror(settings.dangerousPathWithoutImportantInfo, "test.js", 2, 42, dangerousPathWithoutImportantInfoError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII but preserves Code file path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithImportantInfoError = new Error(settings.dangerousPathWithImportantInfo);
      dangerousPathWithImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII but preserves Code file path", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const dangerousPathWithImportantInfoError = new Error("dangerousPathWithImportantInfo");
    dangerousPathWithImportantInfoError.stack = settings.stack;
    mainWindow.onerror(settings.dangerousPathWithImportantInfo, "test.js", 2, 42, dangerousPathWithImportantInfoError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedNodeModuleAsarPath), -1, "bare node_modules.asar path");
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedNodeModulePath), -1, "bare node_modules path");
    assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII but preserves Code file path with node modules", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithImportantInfoError = new Error(settings.dangerousPathWithImportantInfo);
      dangerousPathWithImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      const cs = testAppender.events[0].data.callstack;
      assert.notStrictEqual(cs.indexOf(settings.anonymizedNodeModuleAsarPath), -1, "bare node_modules.asar path");
      assert.notStrictEqual(cs.indexOf(settings.anonymizedNodeModulePath), -1, "bare node_modules path");
      assert.notStrictEqual(cs.indexOf(settings.anonymizedFullNodeModulePath), -1, "full node_modules path");
      assert.notStrictEqual(cs.indexOf(settings.anonymizedFullNodeModuleAsarPath), -1, "full node_modules.asar path");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Unexpected Error Telemetry removes PII but preserves extension path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithImportantInfoError = new Error(settings.dangerousPathWithImportantInfo);
      dangerousPathWithImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.extensionPathToRetain), -1, "User extension path should be retained");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedExtensionPath), -1, "User extension path should be anonymized with preserved extension name");
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/Users/username/"), -1, "Username should be redacted from extension path");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.serverInsidersExtensionPathToRetain), -1, "Server-insiders extension path should be retained");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedServerInsidersExtensionPath), -1, "Server-insiders extension path should be anonymized with preserved extension name");
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/home/user/"), -1, "Home directory should be redacted from server-insiders extension path");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.builtinExtensionPathToRetain), -1, "Built-in extension path should be retained");
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.anonymizedBuiltinExtensionPath), -1, "Built-in extension path should be anonymized with preserved extension name");
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/Applications/Visual Studio Code.app"), -1, "App path should be redacted from built-in extension path");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Unexpected Error Telemetry removes PII but preserves Code file path when PIIPath is configured", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender], piiPaths: [settings.personalInfo + "/resources/app/"] });
      const errorTelemetry = new ErrorTelemetry(service);
      const dangerousPathWithImportantInfoError = new Error(settings.dangerousPathWithImportantInfo);
      dangerousPathWithImportantInfoError.stack = settings.stack;
      Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII but preserves Code file path when PIIPath is configured", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender], piiPaths: [settings.personalInfo + "/resources/app/"] });
    const errorTelemetry = new ErrorTelemetry(service);
    const dangerousPathWithImportantInfoError = new Error("dangerousPathWithImportantInfo");
    dangerousPathWithImportantInfoError.stack = settings.stack;
    mainWindow.onerror(settings.dangerousPathWithImportantInfo, "test.js", 2, 42, dangerousPathWithImportantInfoError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII but preserves Missing Model error message", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const missingModelError = new Error(settings.missingModelMessage);
      missingModelError.stack = settings.stack;
      Errors.onUnexpectedError(missingModelError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.missingModelPrefix), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.missingModelPrefix), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII but preserves Missing Model error message", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const settings = new ErrorTestingSettings();
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const missingModelError = new Error("missingModelMessage");
    missingModelError.stack = settings.stack;
    mainWindow.onerror(settings.missingModelMessage, "test.js", 2, 42, missingModelError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.missingModelPrefix), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.missingModelPrefix), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes PII but preserves No Such File error message", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const noSuchFileError = new Error(settings.noSuchFileMessage);
      noSuchFileError.stack = settings.stack;
      Errors.onUnexpectedError(noSuchFileError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.noSuchFilePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.noSuchFilePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes PII but preserves No Such File error message", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const errorStub = sinon.stub();
      mainWindow.onerror = errorStub;
      const settings = new ErrorTestingSettings();
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const noSuchFileError = new Error("noSuchFileMessage");
      noSuchFileError.stack = settings.stack;
      mainWindow.onerror(settings.noSuchFileMessage, "test.js", 2, 42, noSuchFileError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(errorStub.callCount, 1);
      Errors.onUnexpectedError(noSuchFileError);
      assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.noSuchFilePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.noSuchFilePrefix), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.split("\n").length, settings.stack.length);
      errorTelemetry.dispose();
      service.dispose();
      sinon.restore();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Telemetry Service sends events when telemetry is on", sinonTestFn(function() {
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
    service.publicLog("testEvent");
    assert.strictEqual(testAppender.getEventsCount(), 1);
    service.dispose();
  }));
  test("Telemetry Service checks with config service", function() {
    let telemetryLevel = TelemetryConfiguration.OFF;
    const emitter = new Emitter();
    const testAppender = new TestTelemetryAppender();
    const service = new TelemetryService({
      appenders: [testAppender]
    }, new class extends TestConfigurationService {
      constructor() {
        super(...arguments);
        this.onDidChangeConfiguration = emitter.event;
      }
      getValue() {
        return telemetryLevel;
      }
    }(), TestProductService);
    assert.strictEqual(service.telemetryLevel, TelemetryLevel.NONE);
    telemetryLevel = TelemetryConfiguration.ON;
    emitter.fire({ affectsConfiguration: () => true });
    assert.strictEqual(service.telemetryLevel, TelemetryLevel.USAGE);
    telemetryLevel = TelemetryConfiguration.ERROR;
    emitter.fire({ affectsConfiguration: () => true });
    assert.strictEqual(service.telemetryLevel, TelemetryLevel.ERROR);
    service.dispose();
  });
  test("Unexpected Error Telemetry removes Windows PII but preserves code path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const windowsUserPath = "c:/Users/bpasero/AppData/Local/Programs/Microsoft%20VS%20Code%20Insiders/resources/app/";
      const codePath = "out/vs/workbench/workbench.desktop.main.js";
      const stack = [
        `    at cTe.gc (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:81492)`,
        `    at async cTe.setInput (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:80650)`,
        `    at async qJe.S (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:58520)`,
        `    at async qJe.L (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:57080)`,
        `    at async qJe.openEditor (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:56162)`
      ];
      const windowsError = new Error("The editor could not be opened because the file was not found.");
      windowsError.stack = stack.join("\n");
      Errors.onUnexpectedError(windowsError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("bpasero"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Users"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("c:/Users"), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes Windows PII but preserves code path", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const windowsUserPath = "c:/Users/bpasero/AppData/Local/Programs/Microsoft%20VS%20Code%20Insiders/resources/app/";
    const codePath = "out/vs/workbench/workbench.desktop.main.js";
    const stack = [
      `    at cTe.gc (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:81492)`,
      `    at async cTe.setInput (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:80650)`,
      `    at async qJe.S (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:58520)`
    ];
    const windowsError = new Error("The editor could not be opened because the file was not found.");
    windowsError.stack = stack.join("\n");
    mainWindow.onerror("The editor could not be opened because the file was not found.", "test.js", 2, 42, windowsError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("bpasero"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Users"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("c:/Users"), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes macOS PII but preserves code path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const macUserPath = "Applications/Visual%20Studio%20Code%20-%20Insiders.app/Contents/Resources/app/";
      const codePath = "out/vs/workbench/workbench.desktop.main.js";
      const stack = [
        `    at uTe.gc (vscode-file://vscode-app/${macUserPath}${codePath}:2720:81492)`,
        `    at async uTe.setInput (vscode-file://vscode-app/${macUserPath}${codePath}:2720:80650)`,
        `    at async JJe.S (vscode-file://vscode-app/${macUserPath}${codePath}:698:58520)`,
        `    at async JJe.L (vscode-file://vscode-app/${macUserPath}${codePath}:698:57080)`,
        `    at async JJe.openEditor (vscode-file://vscode-app/${macUserPath}${codePath}:698:56162)`
      ];
      const macError = new Error("The editor could not be opened because the file was not found.");
      macError.stack = stack.join("\n");
      Errors.onUnexpectedError(macError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Applications/Visual"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Visual%20Studio%20Code"), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes macOS PII but preserves code path", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const macUserPath = "Applications/Visual%20Studio%20Code%20-%20Insiders.app/Contents/Resources/app/";
    const codePath = "out/vs/workbench/workbench.desktop.main.js";
    const stack = [
      `    at uTe.gc (vscode-file://vscode-app/${macUserPath}${codePath}:2720:81492)`,
      `    at async uTe.setInput (vscode-file://vscode-app/${macUserPath}${codePath}:2720:80650)`,
      `    at async JJe.S (vscode-file://vscode-app/${macUserPath}${codePath}:698:58520)`
    ];
    const macError = new Error("The editor could not be opened because the file was not found.");
    macError.stack = stack.join("\n");
    mainWindow.onerror("The editor could not be opened because the file was not found.", "test.js", 2, 42, macError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Applications/Visual"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("Visual%20Studio%20Code"), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry removes Linux PII but preserves code path", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const service = new TestErrorTelemetryService({ appenders: [testAppender] });
      const errorTelemetry = new ErrorTelemetry(service);
      const linuxUserPath = "/home/parallels/GitDevelopment/vscode-node-sqlite3-perf/";
      const linuxSystemPath = "usr/share/code-insiders/resources/app/";
      const codePath = "out/vs/workbench/workbench.desktop.main.js";
      const stack = [
        `    at _kt.G (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65940)`,
        `    at _kt.F (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65765)`,
        `    at async axt.L (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9998)`,
        `    at async axt.readStream (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9773)`,
        `    at async mye.Eb (vscode-file://vscode-app/${linuxSystemPath}${codePath}:1313:12359)`
      ];
      const linuxError = new Error(`Invalid fake file 'git:${linuxUserPath}index.js.git?{"path":"${linuxUserPath}index.js","ref":""}' (Canceled: Canceled)`);
      linuxError.stack = stack.join("\n");
      Errors.onUnexpectedError(linuxError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf("parallels"), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf("/home/parallels"), -1);
      assert.strictEqual(testAppender.events[0].data.msg.indexOf("GitDevelopment"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("parallels"), -1);
      assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/home/parallels"), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
      assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  test("Uncaught Error Telemetry removes Linux PII but preserves code path", sinonTestFn(function() {
    const errorStub = sinon.stub();
    mainWindow.onerror = errorStub;
    const testAppender = new TestTelemetryAppender();
    const service = new TestErrorTelemetryService({ appenders: [testAppender] });
    const errorTelemetry = new ErrorTelemetry(service);
    const linuxUserPath = "/home/parallels/GitDevelopment/vscode-node-sqlite3-perf/";
    const linuxSystemPath = "usr/share/code-insiders/resources/app/";
    const codePath = "out/vs/workbench/workbench.desktop.main.js";
    const stack = [
      `    at _kt.G (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65940)`,
      `    at _kt.F (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65765)`,
      `    at async axt.L (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9998)`
    ];
    const linuxError = new Error(`Unable to read file 'git:${linuxUserPath}index.js.git'`);
    linuxError.stack = stack.join("\n");
    mainWindow.onerror(`Unable to read file 'git:${linuxUserPath}index.js.git'`, "test.js", 2, 42, linuxError);
    this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
    assert.strictEqual(errorStub.callCount, 1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf("parallels"), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf("/home/parallels"), -1);
    assert.strictEqual(testAppender.events[0].data.msg.indexOf("GitDevelopment"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("parallels"), -1);
    assert.strictEqual(testAppender.events[0].data.callstack.indexOf("/home/parallels"), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
    assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf("out/vs/workbench"), -1);
    errorTelemetry.dispose();
    service.dispose();
    sinon.restore();
  }));
  test("Unexpected Error Telemetry strips web origin but preserves path in web stack traces when piiPaths includes origin", sinonTestFn(function() {
    const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
    Errors.setUnexpectedErrorHandler(() => {
    });
    try {
      const testAppender = new TestTelemetryAppender();
      const webOrigin = "https://codespace-host.github.dev";
      const service = new TestErrorTelemetryService({ appenders: [testAppender], piiPaths: [webOrigin] });
      const errorTelemetry = new ErrorTelemetry(service);
      const bundlePath = "/static/build/bundle.js";
      const stack = [
        `Error: Something failed`,
        `    at x3t._delegate (${webOrigin}${bundlePath}:1:200953)`,
        `    at y4u.run (${webOrigin}${bundlePath}:1:304822)`,
        `    at DedicatedWorkerGlobalScope.self.onmessage`
      ];
      const webError = new Error("Something failed");
      webError.stack = stack.join("\n");
      Errors.onUnexpectedError(webError);
      this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
      assert.strictEqual(testAppender.getEventsCount(), 1);
      const cs = testAppender.events[0].data.callstack;
      assert.strictEqual(cs.indexOf(webOrigin), -1, "Web origin should be stripped");
      assert.strictEqual(cs.indexOf("https://"), -1, "HTTPS scheme should be stripped");
      assert.notStrictEqual(cs.indexOf(bundlePath), -1, "Bundle path should be preserved");
      errorTelemetry.dispose();
      service.dispose();
    } finally {
      Errors.setUnexpectedErrorHandler(origErrorHandler);
    }
  }));
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RlbGVtZXRyeS90ZXN0L2Jyb3dzZXIvdGVsZW1ldHJ5U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCBzaW5vblRlc3QgZnJvbSAnc2lub24tdGVzdCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgKiBhcyBFcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IEVycm9yVGVsZW1ldHJ5IGZyb20gJy4uLy4uL2Jyb3dzZXIvZXJyb3JUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgVGVsZW1ldHJ5Q29uZmlndXJhdGlvbiwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlQ29uZmlnLCBUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3RlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeUFwcGVuZGVyLCBOdWxsQXBwZW5kZXIgfSBmcm9tICcuLi8uLi9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuXG5jb25zdCBzaW5vblRlc3RGbiA9IHNpbm9uVGVzdChzaW5vbik7XG5cbmNsYXNzIFRlc3RUZWxlbWV0cnlBcHBlbmRlciBpbXBsZW1lbnRzIElUZWxlbWV0cnlBcHBlbmRlciB7XG5cblx0cHVibGljIGV2ZW50czogYW55W107XG5cdHB1YmxpYyBpc0Rpc3Bvc2VkOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuZXZlbnRzID0gW107XG5cdFx0dGhpcy5pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgbG9nKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogYW55KTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YSB9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFdmVudHNDb3VudCgpIHtcblx0XHRyZXR1cm4gdGhpcy5ldmVudHMubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGZsdXNoKCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhpcy5pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHR9XG59XG5cbmNsYXNzIEVycm9yVGVzdGluZ1NldHRpbmdzIHtcblx0cHVibGljIHBlcnNvbmFsSW5mbzogc3RyaW5nO1xuXHRwdWJsaWMgaW1wb3J0YW50SW5mbzogc3RyaW5nO1xuXHRwdWJsaWMgZmlsZVByZWZpeDogc3RyaW5nO1xuXHRwdWJsaWMgZGFuZ2Vyb3VzUGF0aFdpdGhvdXRJbXBvcnRhbnRJbmZvOiBzdHJpbmc7XG5cdHB1YmxpYyBkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm86IHN0cmluZztcblx0cHVibGljIG1pc3NpbmdNb2RlbFByZWZpeDogc3RyaW5nO1xuXHRwdWJsaWMgbWlzc2luZ01vZGVsTWVzc2FnZTogc3RyaW5nO1xuXHRwdWJsaWMgbm9TdWNoRmlsZVByZWZpeDogc3RyaW5nO1xuXHRwdWJsaWMgbm9TdWNoRmlsZU1lc3NhZ2U6IHN0cmluZztcblx0cHVibGljIHN0YWNrOiBzdHJpbmdbXTtcblx0cHVibGljIHJhbmRvbVVzZXJGaWxlOiBzdHJpbmcgPSAnYS9wYXRoL3RoYXQvZG9lX3NudC9jb24tdGFpbi9jb2RlL25hbWVzLmpzJztcblx0cHVibGljIGFub255bWl6ZWRSYW5kb21Vc2VyRmlsZTogc3RyaW5nID0gJzxSRURBQ1RFRDogdXNlci1maWxlLXBhdGg+Jztcblx0cHVibGljIG5vZGVNb2R1bGVQYXRoVG9SZXRhaW46IHN0cmluZyA9ICdub2RlX21vZHVsZXMvcGF0aC90aGF0L3Nob3VsZGJlL3JldGFpbmVkL25hbWVzLmpzOjE0OjE1ODU0Jztcblx0cHVibGljIGFub255bWl6ZWROb2RlTW9kdWxlUGF0aDogc3RyaW5nID0gJzxSRURBQ1RFRDogdXNlci1maWxlLXBhdGg+L25vZGVfbW9kdWxlcy9wYXRoL3RoYXQvc2hvdWxkYmUvcmV0YWluZWQvbmFtZXMuanM6MTQ6MTU4NTQnO1xuXHRwdWJsaWMgbm9kZU1vZHVsZUFzYXJQYXRoVG9SZXRhaW46IHN0cmluZyA9ICdub2RlX21vZHVsZXMuYXNhci9wYXRoL3RoYXQvc2hvdWxkYmUvcmV0YWluZWQvbmFtZXMuanM6MTQ6MTIzNTQnO1xuXHRwdWJsaWMgYW5vbnltaXplZE5vZGVNb2R1bGVBc2FyUGF0aDogc3RyaW5nID0gJzxSRURBQ1RFRDogdXNlci1maWxlLXBhdGg+L25vZGVfbW9kdWxlcy5hc2FyL3BhdGgvdGhhdC9zaG91bGRiZS9yZXRhaW5lZC9uYW1lcy5qczoxNDoxMjM1NCc7XG5cdHB1YmxpYyBmdWxsTm9kZU1vZHVsZVBhdGg6IHN0cmluZyA9ICcvVXNlcnMvdXNlcm5hbWUvcHJvamVjdHMvdnNjb2RlL25vZGVfbW9kdWxlcy9AeHRlcm0veHRlcm0vbGliL3h0ZXJtLmpzOjE6MjQzNzMyJztcblx0cHVibGljIGFub255bWl6ZWRGdWxsTm9kZU1vZHVsZVBhdGg6IHN0cmluZyA9ICc8UkVEQUNURUQ6IHVzZXItZmlsZS1wYXRoPi9ub2RlX21vZHVsZXMvQHh0ZXJtL3h0ZXJtL2xpYi94dGVybS5qczoxOjI0MzczMic7XG5cdHB1YmxpYyBmdWxsTm9kZU1vZHVsZUFzYXJQYXRoOiBzdHJpbmcgPSAnL1VzZXJzL3VzZXJuYW1lL3Byb2plY3RzL3ZzY29kZS9ub2RlX21vZHVsZXMuYXNhci9AeHRlcm0veHRlcm0vbGliL3h0ZXJtLmpzOjE6Mzc2MDY2Jztcblx0cHVibGljIGFub255bWl6ZWRGdWxsTm9kZU1vZHVsZUFzYXJQYXRoOiBzdHJpbmcgPSAnPFJFREFDVEVEOiB1c2VyLWZpbGUtcGF0aD4vbm9kZV9tb2R1bGVzLmFzYXIvQHh0ZXJtL3h0ZXJtL2xpYi94dGVybS5qczoxOjM3NjA2Nic7XG5cdHB1YmxpYyBleHRlbnNpb25QYXRoVG9SZXRhaW46IHN0cmluZyA9ICcudnNjb2RlL2V4dGVuc2lvbnMvbXMtcHl0aG9uLnB5dGhvbi0yMDI0LjAuMS9vdXQvZXh0ZW5zaW9uLmpzOjE0NDoxNDU1MTYnO1xuXHRwdWJsaWMgZnVsbEV4dGVuc2lvblBhdGg6IHN0cmluZyA9ICcvVXNlcnMvdXNlcm5hbWUvLnZzY29kZS9leHRlbnNpb25zL21zLXB5dGhvbi5weXRob24tMjAyNC4wLjEvb3V0L2V4dGVuc2lvbi5qczoxNDQ6MTQ1NTE2Jztcblx0cHVibGljIGFub255bWl6ZWRFeHRlbnNpb25QYXRoOiBzdHJpbmcgPSAnPFJFREFDVEVEOiB1c2VyLWZpbGUtcGF0aD4vLnZzY29kZS9leHRlbnNpb25zL21zLXB5dGhvbi5weXRob24tMjAyNC4wLjEvb3V0L2V4dGVuc2lvbi5qczoxNDQ6MTQ1NTE2Jztcblx0cHVibGljIHNlcnZlckluc2lkZXJzRXh0ZW5zaW9uUGF0aFRvUmV0YWluOiBzdHJpbmcgPSAnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvZXh0ZW5zaW9ucy9tcy12c2NvZGUucmVtb3RlLXNlcnZlci0yMDI0LjEuMC9vdXQvc2VydmVyLmpzOjk5Ojg4ODgnO1xuXHRwdWJsaWMgZnVsbFNlcnZlckluc2lkZXJzRXh0ZW5zaW9uUGF0aDogc3RyaW5nID0gJy9ob21lL3VzZXIvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvZXh0ZW5zaW9ucy9tcy12c2NvZGUucmVtb3RlLXNlcnZlci0yMDI0LjEuMC9vdXQvc2VydmVyLmpzOjk5Ojg4ODgnO1xuXHRwdWJsaWMgYW5vbnltaXplZFNlcnZlckluc2lkZXJzRXh0ZW5zaW9uUGF0aDogc3RyaW5nID0gJzxSRURBQ1RFRDogdXNlci1maWxlLXBhdGg+Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2V4dGVuc2lvbnMvbXMtdnNjb2RlLnJlbW90ZS1zZXJ2ZXItMjAyNC4xLjAvb3V0L3NlcnZlci5qczo5OTo4ODg4Jztcblx0cHVibGljIGJ1aWx0aW5FeHRlbnNpb25QYXRoVG9SZXRhaW46IHN0cmluZyA9ICdSZXNvdXJjZXMvYXBwL2V4dGVuc2lvbnMvZ2l0L291dC9naXQuanM6NDI6MTIzNCc7XG5cdHB1YmxpYyBmdWxsQnVpbHRpbkV4dGVuc2lvblBhdGg6IHN0cmluZyA9ICcvQXBwbGljYXRpb25zL1Zpc3VhbCBTdHVkaW8gQ29kZS5hcHAvQ29udGVudHMvUmVzb3VyY2VzL2FwcC9leHRlbnNpb25zL2dpdC9vdXQvZ2l0LmpzOjQyOjEyMzQnO1xuXHRwdWJsaWMgYW5vbnltaXplZEJ1aWx0aW5FeHRlbnNpb25QYXRoOiBzdHJpbmcgPSAnPFJFREFDVEVEOiB1c2VyLWZpbGUtcGF0aD4vUmVzb3VyY2VzL2FwcC9leHRlbnNpb25zL2dpdC9vdXQvZ2l0LmpzOjQyOjEyMzQnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMucGVyc29uYWxJbmZvID0gJ0RBTkdFUk9VUy9QQVRIJztcblx0XHR0aGlzLmltcG9ydGFudEluZm8gPSAnaW1wb3J0YW50L2luZm9ybWF0aW9uJztcblx0XHR0aGlzLmZpbGVQcmVmaXggPSAnZmlsZTovLy8nO1xuXHRcdHRoaXMuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvID0gdGhpcy5maWxlUHJlZml4ICsgdGhpcy5wZXJzb25hbEluZm8gKyAnL3Jlc291cmNlcy9hcHAvJyArIHRoaXMuaW1wb3J0YW50SW5mbztcblx0XHR0aGlzLmRhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mbyA9IHRoaXMuZmlsZVByZWZpeCArIHRoaXMucGVyc29uYWxJbmZvO1xuXG5cdFx0dGhpcy5taXNzaW5nTW9kZWxQcmVmaXggPSAnUmVjZWl2ZWQgbW9kZWwgZXZlbnRzIGZvciBtaXNzaW5nIG1vZGVsICc7XG5cdFx0dGhpcy5taXNzaW5nTW9kZWxNZXNzYWdlID0gdGhpcy5taXNzaW5nTW9kZWxQcmVmaXggKyAnICcgKyB0aGlzLmRhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mbztcblxuXHRcdHRoaXMubm9TdWNoRmlsZVByZWZpeCA9ICdFTk9FTlQ6IG5vIHN1Y2ggZmlsZSBvciBkaXJlY3RvcnknO1xuXHRcdHRoaXMubm9TdWNoRmlsZU1lc3NhZ2UgPSB0aGlzLm5vU3VjaEZpbGVQcmVmaXggKyAnIFxcJycgKyB0aGlzLnBlcnNvbmFsSW5mbyArICdcXCcnO1xuXG5cdFx0dGhpcy5zdGFjayA9IFtgYXQgZS5fbW9kZWxFdmVudHMgKCR7dGhpcy5yYW5kb21Vc2VyRmlsZX06MTE6NzMwOSlgLFxuXHRcdGAgICAgYXQgdC5BbGxXb3JrZXJzICgke3RoaXMucmFuZG9tVXNlckZpbGV9OjY6ODg0NClgLFxuXHRcdGAgICAgYXQgZS4oYW5vbnltb3VzIGZ1bmN0aW9uKSBbYXMgX21vZGVsRXZlbnRzXSAoJHt0aGlzLnJhbmRvbVVzZXJGaWxlfTo1OjI5NTUyKWAsXG5cdFx0YCAgICBhdCBGdW5jdGlvbi48YW5vbnltb3VzPiAoJHt0aGlzLnJhbmRvbVVzZXJGaWxlfTo2OjgyNzIpYCxcblx0XHRgICAgIGF0IGUuZGlzcGF0Y2ggKCR7dGhpcy5yYW5kb21Vc2VyRmlsZX06NToyNjkzMSlgLFxuXHRcdGAgICAgYXQgZS5yZXF1ZXN0ICgvJHt0aGlzLm5vZGVNb2R1bGVBc2FyUGF0aFRvUmV0YWlufSlgLFxuXHRcdGAgICAgYXQgdC5faGFuZGxlTWVzc2FnZSAoJHt0aGlzLm5vZGVNb2R1bGVBc2FyUGF0aFRvUmV0YWlufSlgLFxuXHRcdGAgICAgYXQgdC5fb25tZXNzYWdlICgvJHt0aGlzLm5vZGVNb2R1bGVQYXRoVG9SZXRhaW59KWAsXG5cdFx0YCAgICBhdCB0Lm9ubWVzc2FnZSAoJHt0aGlzLm5vZGVNb2R1bGVQYXRoVG9SZXRhaW59KWAsXG5cdFx0YCAgICBhdCBnZXQgZGltZW5zaW9ucyAoJHt0aGlzLmZ1bGxOb2RlTW9kdWxlUGF0aH0pYCxcblx0XHRgICAgIGF0IF8uX3JlZnJlc2hDYW52YXNEaW1lbnNpb25zICgke3RoaXMuZnVsbE5vZGVNb2R1bGVBc2FyUGF0aH0pYCxcblx0XHRgICAgIGF0IHV2LnByb3ZpZGVDb2RlQWN0aW9ucyAoJHt0aGlzLmZ1bGxFeHRlbnNpb25QYXRofSlgLFxuXHRcdGAgICAgYXQgcmVtb3RlLmhhbmRsZUNvbm5lY3Rpb24gKCR7dGhpcy5mdWxsU2VydmVySW5zaWRlcnNFeHRlbnNpb25QYXRofSlgLFxuXHRcdGAgICAgYXQgZ2l0LmdldFJlcG9zaXRvcnlTdGF0ZSAoJHt0aGlzLmZ1bGxCdWlsdGluRXh0ZW5zaW9uUGF0aH0pYCxcblx0XHRcdGAgICAgYXQgRGVkaWNhdGVkV29ya2VyR2xvYmFsU2NvcGUuc2VsZi5vbm1lc3NhZ2VgLFxuXHRcdHRoaXMuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvLFxuXHRcdHRoaXMuZGFuZ2Vyb3VzUGF0aFdpdGhvdXRJbXBvcnRhbnRJbmZvLFxuXHRcdHRoaXMubWlzc2luZ01vZGVsTWVzc2FnZSxcblx0XHR0aGlzLm5vU3VjaEZpbGVNZXNzYWdlXTtcblx0fVxufVxuXG5zdWl0ZSgnVGVsZW1ldHJ5U2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBUZXN0UHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCAuLi5wcm9kdWN0IH07XG5cblx0dGVzdCgnRGlzcG9zaW5nJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UucHVibGljTG9nKCd0ZXN0UHJpdmF0ZUV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblxuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCghdGVzdEFwcGVuZGVyLmlzRGlzcG9zZWQsIHRydWUpO1xuXHR9KSk7XG5cblx0Ly8gZXZlbnQgcmVwb3J0aW5nXG5cdHRlc3QoJ1NpbXBsZSBldmVudCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9LCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cblx0XHRzZXJ2aWNlLnB1YmxpY0xvZygndGVzdEV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5ldmVudE5hbWUsICd0ZXN0RXZlbnQnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLCBudWxsKTtcblxuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnRXZlbnQgd2l0aCBkYXRhJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UucHVibGljTG9nKCd0ZXN0RXZlbnQnLCB7XG5cdFx0XHQnc3RyaW5nUHJvcCc6ICdwcm9wZXJ0eScsXG5cdFx0XHQnbnVtYmVyUHJvcCc6IDEsXG5cdFx0XHQnYm9vbGVhblByb3AnOiB0cnVlLFxuXHRcdFx0J2NvbXBsZXhQcm9wJzoge1xuXHRcdFx0XHQndmFsdWUnOiAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmV2ZW50TmFtZSwgJ3Rlc3RFdmVudCcpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEsIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGFbJ3N0cmluZ1Byb3AnXSwgJ3Byb3BlcnR5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YVsnbnVtYmVyUHJvcCddLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhWydib29sZWFuUHJvcCddLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhWydjb21wbGV4UHJvcCddLnZhbHVlLCAwKTtcblxuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnY29tbW9uIHByb3BlcnRpZXMgYWRkZWQgdG8gKmFsbCogZXZlbnRzLCBzaW1wbGUgZXZlbnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVsZW1ldHJ5U2VydmljZSh7XG5cdFx0XHRhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdLFxuXHRcdFx0Y29tbW9uUHJvcGVydGllczogeyBmb286ICdKQSEnLCBnZXQgYmFyKCkgeyByZXR1cm4gTWF0aC5yYW5kb20oKSAlIDIgPT09IDA7IH0gfVxuXHRcdH0sIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSwgVGVzdFByb2R1Y3RTZXJ2aWNlKTtcblxuXHRcdHNlcnZpY2UucHVibGljTG9nKCd0ZXN0RXZlbnQnKTtcblx0XHRjb25zdCBbZmlyc3RdID0gdGVzdEFwcGVuZGVyLmV2ZW50cztcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3Qua2V5cyhmaXJzdC5kYXRhKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgZmlyc3QuZGF0YVsnZm9vJ10sICdzdHJpbmcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGZpcnN0LmRhdGFbJ2JhciddLCAnYm9vbGVhbicpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbW1vbiBwcm9wZXJ0aWVzIGFkZGVkIHRvICphbGwqIGV2ZW50cywgZXZlbnQgd2l0aCBkYXRhJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlbGVtZXRyeVNlcnZpY2Uoe1xuXHRcdFx0YXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSxcblx0XHRcdGNvbW1vblByb3BlcnRpZXM6IHsgZm9vOiAnSkEhJywgZ2V0IGJhcigpIHsgcmV0dXJuIE1hdGgucmFuZG9tKCkgJSAyID09PSAwOyB9IH1cblx0XHR9LCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cblx0XHRzZXJ2aWNlLnB1YmxpY0xvZygndGVzdEV2ZW50JywgeyBoaWdodG93ZXI6ICd4bCcsIHByaWNlOiA4MDAwIH0pO1xuXHRcdGNvbnN0IFtmaXJzdF0gPSB0ZXN0QXBwZW5kZXIuZXZlbnRzO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5rZXlzKGZpcnN0LmRhdGEpLmxlbmd0aCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBmaXJzdC5kYXRhWydmb28nXSwgJ3N0cmluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgZmlyc3QuZGF0YVsnYmFyJ10sICdib29sZWFuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBmaXJzdC5kYXRhWydoaWdodG93ZXInXSwgJ3N0cmluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgZmlyc3QuZGF0YVsncHJpY2UnXSwgJ251bWJlcicpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RlbGVtZXRyeUluZm8gY29tZXMgZnJvbSBwcm9wZXJ0aWVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVsZW1ldHJ5U2VydmljZSh7XG5cdFx0XHRhcHBlbmRlcnM6IFtOdWxsQXBwZW5kZXJdLFxuXHRcdFx0Y29tbW9uUHJvcGVydGllczoge1xuXHRcdFx0XHRzZXNzaW9uSUQ6ICdvbmUnLFxuXHRcdFx0XHRbJ2NvbW1vbi5tYWNoaW5lSWQnXTogJ3RocmVlJyxcblx0XHRcdH1cblx0XHR9LCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5zZXNzaW9uSWQsICdvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5tYWNoaW5lSWQsICd0aHJlZScpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldENvbW1vblByb3BlcnR5IGFkZHMgcHJvcGVydHkgdG8gYWxsIHN1YnNlcXVlbnQgZXZlbnRzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlbGVtZXRyeVNlcnZpY2Uoe1xuXHRcdFx0YXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSxcblx0XHR9LCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cblx0XHRzZXJ2aWNlLnB1YmxpY0xvZygnZXZlbnRCZWZvcmVTZXQnKTtcblx0XHRzZXJ2aWNlLnNldENvbW1vblByb3BlcnR5KCdjb21tb24uY29waWxvdFRyYWNraW5nSWQnLCAndGVzdC10cmFja2luZy1pZCcpO1xuXHRcdHNlcnZpY2UucHVibGljTG9nKCdldmVudEFmdGVyU2V0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhWydjb21tb24uY29waWxvdFRyYWNraW5nSWQnXSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1sxXS5kYXRhWydjb21tb24uY29waWxvdFRyYWNraW5nSWQnXSwgJ3Rlc3QtdHJhY2tpbmctaWQnKTtcblxuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZWxlbWV0cnkgb24gYnkgZGVmYXVsdCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9LCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cblx0XHRzZXJ2aWNlLnB1YmxpY0xvZygndGVzdEV2ZW50Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5ldmVudE5hbWUsICd0ZXN0RXZlbnQnKTtcblxuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRjbGFzcyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlIGV4dGVuZHMgVGVsZW1ldHJ5U2VydmljZSB7XG5cdFx0Y29uc3RydWN0b3IoY29uZmlnOiBJVGVsZW1ldHJ5U2VydmljZUNvbmZpZykge1xuXHRcdFx0c3VwZXIoeyAuLi5jb25maWcsIHNlbmRFcnJvclRlbGVtZXRyeTogdHJ1ZSB9LCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0UHJvZHVjdFNlcnZpY2UpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ0Vycm9yIGV2ZW50cycsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblxuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXG5cdFx0XHRjb25zdCBlOiBhbnkgPSBuZXcgRXJyb3IoJ1RoaXMgaXMgYSB0ZXN0LicpO1xuXHRcdFx0Ly8gZm9yIFBoYW50b21cblx0XHRcdGlmICghZS5zdGFjaykge1xuXHRcdFx0XHRlLnN0YWNrID0gJ2JsYWgnO1xuXHRcdFx0fVxuXG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZ2V0RXZlbnRzQ291bnQoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5ldmVudE5hbWUsICdVbmhhbmRsZWRFcnJvcicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2csICdUaGlzIGlzIGEgdGVzdC4nKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdC8vIFx0dGVzdCgnVW5oYW5kbGVkIFByb21pc2UgRXJyb3IgZXZlbnRzJywgc2lub25UZXN0Rm4oZnVuY3Rpb24oKSB7XG5cdC8vXG5cdC8vIFx0XHRsZXQgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHQvLyBcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4ge30pO1xuXHQvL1xuXHQvLyBcdFx0dHJ5IHtcblx0Ly8gXHRcdFx0bGV0IHNlcnZpY2UgPSBuZXcgTWFpblRlbGVtZXRyeVNlcnZpY2UoKTtcblx0Ly8gXHRcdFx0bGV0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0Ly8gXHRcdFx0c2VydmljZS5hZGRUZWxlbWV0cnlBcHBlbmRlcih0ZXN0QXBwZW5kZXIpO1xuXHQvL1xuXHQvLyBcdFx0XHR3aW5qcy5Qcm9taXNlLndyYXBFcnJvcihuZXcgRXJyb3IoJ1RoaXMgc2hvdWxkIG5vdCBnZXQgbG9nZ2VkJykpO1xuXHQvLyBcdFx0XHR3aW5qcy5UUHJvbWlzZS5hcyh0cnVlKS50aGVuKCgpID0+IHtcblx0Ly8gXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RoaXMgc2hvdWxkIGdldCBsb2dnZWQnKTtcblx0Ly8gXHRcdFx0fSk7XG5cdC8vIFx0XHRcdC8vIHByZXZlbnQgY29uc29sZSBvdXRwdXQgZnJvbSBmYWlsaW5nIHRoZSB0ZXN0XG5cdC8vIFx0XHRcdHRoaXMuc3R1Yihjb25zb2xlLCAnbG9nJyk7XG5cdC8vIFx0XHRcdC8vIGFsbG93IGZvciB0aGUgcHJvbWlzZSB0byBmaW5pc2hcblx0Ly8gXHRcdFx0dGhpcy5jbG9jay50aWNrKE1haW5FcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblx0Ly9cblx0Ly8gXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0Ly8gXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZXZlbnROYW1lLCAnVW5oYW5kbGVkRXJyb3InKTtcblx0Ly8gXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2csICAnVGhpcyBzaG91bGQgZ2V0IGxvZ2dlZCcpO1xuXHQvL1xuXHQvLyBcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0Ly8gXHRcdH0gZmluYWxseSB7XG5cdC8vIFx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHQvLyBcdFx0fVxuXHQvLyBcdH0pKTtcblxuXHR0ZXN0KCdIYW5kbGUgZ2xvYmFsIGVycm9ycycsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBlcnJvclN0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRjb25zdCB0ZXN0RXJyb3IgPSBuZXcgRXJyb3IoJ3Rlc3QnKTtcblx0XHQobWFpbldpbmRvdy5vbmVycm9yKSgnRXJyb3IgTWVzc2FnZScsICdmaWxlLmpzJywgMiwgNDIsIHRlc3RFcnJvcik7XG5cdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5hbHdheXNDYWxsZWRXaXRoRXhhY3RseSgnRXJyb3IgTWVzc2FnZScsICdmaWxlLmpzJywgMiwgNDIsIHRlc3RFcnJvciksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZ2V0RXZlbnRzQ291bnQoKSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZXZlbnROYW1lLCAnVW5oYW5kbGVkRXJyb3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZywgJ0Vycm9yIE1lc3NhZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmZpbGUsICdmaWxlLmpzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5saW5lLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNvbHVtbiwgNDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEudW5jYXVnaHRfZXJyb3JfbXNnLCAndGVzdCcpO1xuXG5cdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ0Vycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSSBmcm9tIGZpbGVuYW1lIHdpdGggc3BhY2VzJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IGVycm9yU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRtYWluV2luZG93Lm9uZXJyb3IgPSBlcnJvclN0dWI7XG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXcgRXJyb3JUZXN0aW5nU2V0dGluZ3MoKTtcblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBlcnNvbkluZm9XaXRoU3BhY2VzID0gc2V0dGluZ3MucGVyc29uYWxJbmZvLnNsaWNlKDAsIDIpICsgJyAnICsgc2V0dGluZ3MucGVyc29uYWxJbmZvLnNsaWNlKDIpO1xuXHRcdGNvbnN0IGRhbmdlcm91c0ZpbGVuYW1lRXJyb3I6IGFueSA9IG5ldyBFcnJvcignZGFuZ2Vyb3VzRmlsZW5hbWUnKTtcblx0XHRkYW5nZXJvdXNGaWxlbmFtZUVycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yKCdkYW5nZXJvdXNGaWxlbmFtZScsIHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mby5yZXBsYWNlKHNldHRpbmdzLnBlcnNvbmFsSW5mbywgcGVyc29uSW5mb1dpdGhTcGFjZXMpICsgJy90ZXN0LmpzJywgMiwgNDIsIGRhbmdlcm91c0ZpbGVuYW1lRXJyb3IpO1xuXHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmZpbGUuaW5kZXhPZihzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8ucmVwbGFjZShzZXR0aW5ncy5wZXJzb25hbEluZm8sIHBlcnNvbkluZm9XaXRoU3BhY2VzKSksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmZpbGUsIHNldHRpbmdzLmltcG9ydGFudEluZm8gKyAnL3Rlc3QuanMnKTtcblxuXHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmNhdWdodCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgZnJvbSBmaWxlbmFtZScsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBjbG9jayA9IHRoaXMuY2xvY2s7XG5cdFx0Y29uc3QgZXJyb3JTdHViID0gc2lub24uc3R1YigpO1xuXHRcdG1haW5XaW5kb3cub25lcnJvciA9IGVycm9yU3R1Yjtcblx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0bGV0IGRhbmdlcm91c0ZpbGVuYW1lRXJyb3I6IGFueSA9IG5ldyBFcnJvcignZGFuZ2Vyb3VzRmlsZW5hbWUnKTtcblx0XHRkYW5nZXJvdXNGaWxlbmFtZUVycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yKCdkYW5nZXJvdXNGaWxlbmFtZScsIHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbyArICcvdGVzdC5qcycsIDIsIDQyLCBkYW5nZXJvdXNGaWxlbmFtZUVycm9yKTtcblx0XHRjbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmZpbGUuaW5kZXhPZihzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8pLCAtMSk7XG5cblx0XHRkYW5nZXJvdXNGaWxlbmFtZUVycm9yID0gbmV3IEVycm9yKCdkYW5nZXJvdXNGaWxlbmFtZScpO1xuXHRcdGRhbmdlcm91c0ZpbGVuYW1lRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblx0XHRtYWluV2luZG93Lm9uZXJyb3IoJ2Rhbmdlcm91c0ZpbGVuYW1lJywgc2V0dGluZ3MuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvICsgJy90ZXN0LmpzJywgMiwgNDIsIGRhbmdlcm91c0ZpbGVuYW1lRXJyb3IpO1xuXHRcdGNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5jYWxsQ291bnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuZmlsZS5pbmRleE9mKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmZpbGUsIHNldHRpbmdzLmltcG9ydGFudEluZm8gKyAnL3Rlc3QuanMnKTtcblxuXHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSScsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXcgRXJyb3JUZXN0aW5nU2V0dGluZ3MoKTtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgZGFuZ2Vyb3VzUGF0aFdpdGhvdXRJbXBvcnRhbnRJbmZvRXJyb3I6IGFueSA9IG5ldyBFcnJvcihzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm8pO1xuXHRcdFx0ZGFuZ2Vyb3VzUGF0aFdpdGhvdXRJbXBvcnRhbnRJbmZvRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihkYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm9FcnJvcik7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3Muc3RhY2tbNF0ucmVwbGFjZShzZXR0aW5ncy5yYW5kb21Vc2VyRmlsZSwgc2V0dGluZ3MuYW5vbnltaXplZFJhbmRvbVVzZXJGaWxlKSksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLnNwbGl0KCdcXG4nKS5sZW5ndGgsIHNldHRpbmdzLnN0YWNrLmxlbmd0aCk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHJlZGFjdHMgb25seSBvZmZlbmRpbmcgZnJhbWVzIGFuZCBwcmVzZXJ2ZXMgdGhlIHJlc3Qgb2YgdGhlIGNhbGxzdGFjaycsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHQvLyBBIGZyYW1lIHdob3NlIGZ1bmN0aW9uIG5hbWUgbWF0Y2hlcyB0aGUgYnJvYWQgYEdlbmVyaWMgU2VjcmV0YCBoZXVyaXN0aWNcblx0XHRcdC8vIChgZ2V0U3RvcmFnZUtleWAgY29udGFpbnMgYGtleShgKSBwcmV2aW91c2x5IGNhdXNlZCB0aGUgZW50aXJlIGNhbGxzdGFja1xuXHRcdFx0Ly8gdG8gYmUgcmVkYWN0ZWQuIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzAxMjAwLlxuXHRcdFx0Y29uc3Qgc3RhY2sgPSBbXG5cdFx0XHRcdCdFcnJvcjogU29tZXRoaW5nIGZhaWxlZCcsXG5cdFx0XHRcdCcgICAgYXQgU3RvcmFnZVNlcnZpY2UuZ2V0U3RvcmFnZUtleSAob3V0L3ZzL3BsYXRmb3JtL3N0b3JhZ2Uvc3RvcmFnZS5qczoxOjIwMCknLFxuXHRcdFx0XHQnICAgIGF0IEZvby5ydW4gKG91dC92cy93b3JrYmVuY2gvZm9vLmpzOjM6NDApJyxcblx0XHRcdFx0JyAgICBhdCBCYXIuYmF6IChvdXQvdnMvd29ya2JlbmNoL2Jhci5qczo1OjYwKScsXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBlcnJvcjogYW55ID0gbmV3IEVycm9yKCdTb21ldGhpbmcgZmFpbGVkJyk7XG5cdFx0XHRlcnJvci5zdGFjayA9IHN0YWNrLmpvaW4oJ1xcbicpO1xuXHRcdFx0RXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGVycm9yKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRcdGNvbnN0IGNzOiBzdHJpbmcgPSB0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrO1xuXHRcdFx0Ly8gVGhlIHdob2xlIHN0YWNrIG11c3Qgbm90IGNvbGxhcHNlIGludG8gYSBzaW5nbGUgcmVkYWN0aW9uIG1hcmtlci5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjcywgJzxSRURBQ1RFRDogR2VuZXJpYyBTZWNyZXQ+JywgJ0VudGlyZSBjYWxsc3RhY2sgc2hvdWxkIG5vdCBiZSByZWRhY3RlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNzLnNwbGl0KCdcXG4nKS5sZW5ndGgsIHN0YWNrLmxlbmd0aCwgJ0FsbCBmcmFtZXMgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdFx0Ly8gT25seSB0aGUgb2ZmZW5kaW5nIGZyYW1lIGlzIHJlZGFjdGVkLCB0aGUgb3RoZXJzIHJlbWFpbiBpbnRhY3QuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY3MuaW5kZXhPZignRm9vLnJ1bicpLCAtMSwgJ05vbi1vZmZlbmRpbmcgZnJhbWVzIHNob3VsZCBiZSBwcmVzZXJ2ZWQnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjcy5pbmRleE9mKCdCYXIuYmF6JyksIC0xLCAnTm9uLW9mZmVuZGluZyBmcmFtZXMgc2hvdWxkIGJlIHByZXNlcnZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNzLmluZGV4T2YoJ2dldFN0b3JhZ2VLZXknKSwgLTEsICdPZmZlbmRpbmcgZnJhbWUgc2hvdWxkIGJlIHJlZGFjdGVkJyk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHN0aWxsIHJlZGFjdHMgYSBmcmFtZSB3aG9zZSB0cmFpbGluZyB0b2tlbiByZWxpZXMgb24gdGhlIG5ld2xpbmUgZGVsaW1pdGVyJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdC8vIGBnZXRBcGlLZXlgIGVuZHMgdGhlIGxpbmUsIHNvIHRoZSBgR2VuZXJpYyBTZWNyZXRgIGhldXJpc3RpYyBvbmx5XG5cdFx0XHQvLyBtYXRjaGVzIGJlY2F1c2Ugb2YgdGhlIGZvbGxvd2luZyBuZXdsaW5lLiBQZXItbGluZSByZWRhY3Rpb24gbXVzdFxuXHRcdFx0Ly8gcmUtYXBwZW5kIHRoYXQgZGVsaW1pdGVyIHNvIHRoaXMgZnJhbWUgaXMgc3RpbGwgcmVkYWN0ZWQsIG1hdGNoaW5nXG5cdFx0XHQvLyB0aGUgcHJldmlvdXMgd2hvbGUtc3RyaW5nIGJlaGF2aW9yLlxuXHRcdFx0Y29uc3Qgc3RhY2sgPSBbXG5cdFx0XHRcdCdFcnJvcjogYm9vbScsXG5cdFx0XHRcdCcgICAgYXQgU2VydmljZS5nZXRBcGlLZXknLFxuXHRcdFx0XHQnICAgIGF0IEZvby5ydW4gKG91dC92cy93b3JrYmVuY2gvZm9vLmpzOjM6NDApJyxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGVycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRcdGVycm9yLnN0YWNrID0gc3RhY2suam9pbignXFxuJyk7XG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmdldEV2ZW50c0NvdW50KCksIDEpO1xuXHRcdFx0Y29uc3QgY3M6IHN0cmluZyA9IHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2s7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3MuaW5kZXhPZignZ2V0QXBpS2V5JyksIC0xLCAnVHJhaWxpbmctdG9rZW4gZnJhbWUgc2hvdWxkIHN0aWxsIGJlIHJlZGFjdGVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY3MuaW5kZXhPZignRm9vLnJ1bicpLCAtMSwgJ090aGVyIGZyYW1lcyBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3Muc3BsaXQoJ1xcbicpLmxlbmd0aCwgc3RhY2subGVuZ3RoLCAnQWxsIGZyYW1lcyBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1VuY2F1Z2h0IEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSScsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBlcnJvclN0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRjb25zdCBkYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm9FcnJvcjogYW55ID0gbmV3IEVycm9yKCdkYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm8nKTtcblx0XHRkYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm9FcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXHRcdG1haW5XaW5kb3cub25lcnJvcihzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aG91dEltcG9ydGFudEluZm8sICd0ZXN0LmpzJywgMiwgNDIsIGRhbmdlcm91c1BhdGhXaXRob3V0SW1wb3J0YW50SW5mb0Vycm9yKTtcblx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0Ly8gVGVzdCB0aGF0IG5vIGZpbGUgaW5mb3JtYXRpb24gcmVtYWlucywgZXNwLiBwZXJzb25hbCBpbmZvXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnN0YWNrWzRdLnJlcGxhY2Uoc2V0dGluZ3MucmFuZG9tVXNlckZpbGUsIHNldHRpbmdzLmFub255bWl6ZWRSYW5kb21Vc2VyRmlsZSkpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSSBidXQgcHJlc2VydmVzIENvZGUgZmlsZSBwYXRoJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXcgRXJyb3JUZXN0aW5nU2V0dGluZ3MoKTtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3I6IGFueSA9IG5ldyBFcnJvcihzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8pO1xuXHRcdFx0ZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblxuXHRcdFx0Ly8gVGVzdCB0aGF0IGltcG9ydGFudCBpbmZvcm1hdGlvbiByZW1haW5zIGJ1dCBwZXJzb25hbCBpbmZvIGRvZXMgbm90XG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmltcG9ydGFudEluZm8pLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuaW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5jYXVnaHQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJIGJ1dCBwcmVzZXJ2ZXMgQ29kZSBmaWxlIHBhdGgnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3QgZXJyb3JTdHViID0gc2lub24uc3R1YigpO1xuXHRcdG1haW5XaW5kb3cub25lcnJvciA9IGVycm9yU3R1Yjtcblx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3I6IGFueSA9IG5ldyBFcnJvcignZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvJyk7XG5cdFx0ZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblx0XHRtYWluV2luZG93Lm9uZXJyb3Ioc2V0dGluZ3MuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvLCAndGVzdC5qcycsIDIsIDQyLCBkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcik7XG5cdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdC8vIFRlc3QgdGhhdCBpbXBvcnRhbnQgaW5mb3JtYXRpb24gcmVtYWlucyBidXQgcGVyc29uYWwgaW5mbyBkb2VzIG5vdFxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuYW5vbnltaXplZE5vZGVNb2R1bGVBc2FyUGF0aCksIC0xLCAnYmFyZSBub2RlX21vZHVsZXMuYXNhciBwYXRoJyk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5hbm9ueW1pemVkTm9kZU1vZHVsZVBhdGgpLCAtMSwgJ2JhcmUgbm9kZV9tb2R1bGVzIHBhdGgnKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmltcG9ydGFudEluZm8pLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuaW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLnNwbGl0KCdcXG4nKS5sZW5ndGgsIHNldHRpbmdzLnN0YWNrLmxlbmd0aCk7XG5cblx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgYnV0IHByZXNlcnZlcyBDb2RlIGZpbGUgcGF0aCB3aXRoIG5vZGUgbW9kdWxlcycsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblxuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mb0Vycm9yOiBhbnkgPSBuZXcgRXJyb3Ioc2V0dGluZ3MuZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvKTtcblx0XHRcdGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mb0Vycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cblxuXHRcdFx0RXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mb0Vycm9yKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0Ly8gQWxsIG5vZGVfbW9kdWxlcyBwYXRocyAoYmFyZSBhbmQgZnVsbCkgc2hvdWxkIHByZXNlcnZlIHRoZSBub2RlX21vZHVsZXMvLi4uIHN1ZmZpeCBhZnRlciByZWRhY3Rpb25cblx0XHRcdGNvbnN0IGNzID0gdGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjaztcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjcy5pbmRleE9mKHNldHRpbmdzLmFub255bWl6ZWROb2RlTW9kdWxlQXNhclBhdGgpLCAtMSwgJ2JhcmUgbm9kZV9tb2R1bGVzLmFzYXIgcGF0aCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNzLmluZGV4T2Yoc2V0dGluZ3MuYW5vbnltaXplZE5vZGVNb2R1bGVQYXRoKSwgLTEsICdiYXJlIG5vZGVfbW9kdWxlcyBwYXRoJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY3MuaW5kZXhPZihzZXR0aW5ncy5hbm9ueW1pemVkRnVsbE5vZGVNb2R1bGVQYXRoKSwgLTEsICdmdWxsIG5vZGVfbW9kdWxlcyBwYXRoJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY3MuaW5kZXhPZihzZXR0aW5ncy5hbm9ueW1pemVkRnVsbE5vZGVNb2R1bGVBc2FyUGF0aCksIC0xLCAnZnVsbCBub2RlX21vZHVsZXMuYXNhciBwYXRoJyk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJIGJ1dCBwcmVzZXJ2ZXMgZXh0ZW5zaW9uIHBhdGgnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvcjogYW55ID0gbmV3IEVycm9yKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbyk7XG5cdFx0XHRkYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm9FcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgdXNlciBleHRlbnNpb24gcGF0aCBpcyBwcmVzZXJ2ZWQgYnV0IHBhcmVudCBmb2xkZXIgaXMgcmVkYWN0ZWRcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuZXh0ZW5zaW9uUGF0aFRvUmV0YWluKSwgLTEsICdVc2VyIGV4dGVuc2lvbiBwYXRoIHNob3VsZCBiZSByZXRhaW5lZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5hbm9ueW1pemVkRXh0ZW5zaW9uUGF0aCksIC0xLCAnVXNlciBleHRlbnNpb24gcGF0aCBzaG91bGQgYmUgYW5vbnltaXplZCB3aXRoIHByZXNlcnZlZCBleHRlbnNpb24gbmFtZScpO1xuXHRcdFx0Ly8gVmVyaWZ5IHRoZSB1c2VybmFtZSBpcyByZW1vdmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCcvVXNlcnMvdXNlcm5hbWUvJyksIC0xLCAnVXNlcm5hbWUgc2hvdWxkIGJlIHJlZGFjdGVkIGZyb20gZXh0ZW5zaW9uIHBhdGgnKTtcblxuXHRcdFx0Ly8gVmVyaWZ5IHNlcnZlci1pbnNpZGVycyBleHRlbnNpb24gcGF0aCBpcyBwcmVzZXJ2ZWQgKG11bHRpLXNlZ21lbnQgc3VmZml4IGxpa2UgLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMpXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnNlcnZlckluc2lkZXJzRXh0ZW5zaW9uUGF0aFRvUmV0YWluKSwgLTEsICdTZXJ2ZXItaW5zaWRlcnMgZXh0ZW5zaW9uIHBhdGggc2hvdWxkIGJlIHJldGFpbmVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmFub255bWl6ZWRTZXJ2ZXJJbnNpZGVyc0V4dGVuc2lvblBhdGgpLCAtMSwgJ1NlcnZlci1pbnNpZGVycyBleHRlbnNpb24gcGF0aCBzaG91bGQgYmUgYW5vbnltaXplZCB3aXRoIHByZXNlcnZlZCBleHRlbnNpb24gbmFtZScpO1xuXHRcdFx0Ly8gVmVyaWZ5IHRoZSBob21lIGRpcmVjdG9yeSBpcyByZW1vdmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCcvaG9tZS91c2VyLycpLCAtMSwgJ0hvbWUgZGlyZWN0b3J5IHNob3VsZCBiZSByZWRhY3RlZCBmcm9tIHNlcnZlci1pbnNpZGVycyBleHRlbnNpb24gcGF0aCcpO1xuXG5cdFx0XHQvLyBWZXJpZnkgYnVpbHQtaW4gZXh0ZW5zaW9uIHBhdGggaXMgcHJlc2VydmVkIGJ1dCBhcHAgZm9sZGVyIGlzIHJlZGFjdGVkXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmJ1aWx0aW5FeHRlbnNpb25QYXRoVG9SZXRhaW4pLCAtMSwgJ0J1aWx0LWluIGV4dGVuc2lvbiBwYXRoIHNob3VsZCBiZSByZXRhaW5lZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5hbm9ueW1pemVkQnVpbHRpbkV4dGVuc2lvblBhdGgpLCAtMSwgJ0J1aWx0LWluIGV4dGVuc2lvbiBwYXRoIHNob3VsZCBiZSBhbm9ueW1pemVkIHdpdGggcHJlc2VydmVkIGV4dGVuc2lvbiBuYW1lJyk7XG5cdFx0XHQvLyBWZXJpZnkgdGhlIGFwcCBwYXRoIGlzIHJlbW92ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJy9BcHBsaWNhdGlvbnMvVmlzdWFsIFN0dWRpbyBDb2RlLmFwcCcpLCAtMSwgJ0FwcCBwYXRoIHNob3VsZCBiZSByZWRhY3RlZCBmcm9tIGJ1aWx0LWluIGV4dGVuc2lvbiBwYXRoJyk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJIGJ1dCBwcmVzZXJ2ZXMgQ29kZSBmaWxlIHBhdGggd2hlbiBQSUlQYXRoIGlzIGNvbmZpZ3VyZWQnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSwgcGlpUGF0aHM6IFtzZXR0aW5ncy5wZXJzb25hbEluZm8gKyAnL3Jlc291cmNlcy9hcHAvJ10gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3I6IGFueSA9IG5ldyBFcnJvcihzZXR0aW5ncy5kYW5nZXJvdXNQYXRoV2l0aEltcG9ydGFudEluZm8pO1xuXHRcdFx0ZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblxuXHRcdFx0Ly8gVGVzdCB0aGF0IGltcG9ydGFudCBpbmZvcm1hdGlvbiByZW1haW5zIGJ1dCBwZXJzb25hbCBpbmZvIGRvZXMgbm90XG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmltcG9ydGFudEluZm8pLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuaW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5jYXVnaHQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgUElJIGJ1dCBwcmVzZXJ2ZXMgQ29kZSBmaWxlIHBhdGggd2hlbiBQSUlQYXRoIGlzIGNvbmZpZ3VyZWQnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3QgZXJyb3JTdHViID0gc2lub24uc3R1YigpO1xuXHRcdG1haW5XaW5kb3cub25lcnJvciA9IGVycm9yU3R1Yjtcblx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdLCBwaWlQYXRoczogW3NldHRpbmdzLnBlcnNvbmFsSW5mbyArICcvcmVzb3VyY2VzL2FwcC8nXSB9KTtcblx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mb0Vycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ2Rhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbycpO1xuXHRcdGRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mb0Vycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yKHNldHRpbmdzLmRhbmdlcm91c1BhdGhXaXRoSW1wb3J0YW50SW5mbywgJ3Rlc3QuanMnLCAyLCA0MiwgZGFuZ2Vyb3VzUGF0aFdpdGhJbXBvcnRhbnRJbmZvRXJyb3IpO1xuXHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblx0XHQvLyBUZXN0IHRoYXQgaW1wb3J0YW50IGluZm9ybWF0aW9uIHJlbWFpbnMgYnV0IHBlcnNvbmFsIGluZm8gZG9lcyBub3Rcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLmltcG9ydGFudEluZm8pLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5wZXJzb25hbEluZm8pLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuaW1wb3J0YW50SW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLnNwbGl0KCdcXG4nKS5sZW5ndGgsIHNldHRpbmdzLnN0YWNrLmxlbmd0aCk7XG5cblx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgYnV0IHByZXNlcnZlcyBNaXNzaW5nIE1vZGVsIGVycm9yIG1lc3NhZ2UnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBtaXNzaW5nTW9kZWxFcnJvcjogYW55ID0gbmV3IEVycm9yKHNldHRpbmdzLm1pc3NpbmdNb2RlbE1lc3NhZ2UpO1xuXHRcdFx0bWlzc2luZ01vZGVsRXJyb3Iuc3RhY2sgPSBzZXR0aW5ncy5zdGFjaztcblxuXHRcdFx0Ly8gVGVzdCB0aGF0IG5vIGZpbGUgaW5mb3JtYXRpb24gcmVtYWlucywgYnV0IHRoaXMgcGFydGljdWxhclxuXHRcdFx0Ly8gZXJyb3IgbWVzc2FnZSBkb2VzIChSZWNlaXZlZCBtb2RlbCBldmVudHMgZm9yIG1pc3NpbmcgbW9kZWwpXG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3IobWlzc2luZ01vZGVsRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLm1pc3NpbmdNb2RlbFByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5taXNzaW5nTW9kZWxQcmVmaXgpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3Muc3RhY2tbNF0ucmVwbGFjZShzZXR0aW5ncy5yYW5kb21Vc2VyRmlsZSwgc2V0dGluZ3MuYW5vbnltaXplZFJhbmRvbVVzZXJGaWxlKSksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLnNwbGl0KCdcXG4nKS5sZW5ndGgsIHNldHRpbmdzLnN0YWNrLmxlbmd0aCk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnRXJyb3JIYW5kbGVyKTtcblx0XHR9XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmNhdWdodCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgYnV0IHByZXNlcnZlcyBNaXNzaW5nIE1vZGVsIGVycm9yIG1lc3NhZ2UnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3QgZXJyb3JTdHViID0gc2lub24uc3R1YigpO1xuXHRcdG1haW5XaW5kb3cub25lcnJvciA9IGVycm9yU3R1Yjtcblx0XHRjb25zdCBzZXR0aW5ncyA9IG5ldyBFcnJvclRlc3RpbmdTZXR0aW5ncygpO1xuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbWlzc2luZ01vZGVsRXJyb3I6IGFueSA9IG5ldyBFcnJvcignbWlzc2luZ01vZGVsTWVzc2FnZScpO1xuXHRcdG1pc3NpbmdNb2RlbEVycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yKHNldHRpbmdzLm1pc3NpbmdNb2RlbE1lc3NhZ2UsICd0ZXN0LmpzJywgMiwgNDIsIG1pc3NpbmdNb2RlbEVycm9yKTtcblx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0Ly8gVGVzdCB0aGF0IG5vIGZpbGUgaW5mb3JtYXRpb24gcmVtYWlucywgYnV0IHRoaXMgcGFydGljdWxhclxuXHRcdC8vIGVycm9yIG1lc3NhZ2UgZG9lcyAoUmVjZWl2ZWQgbW9kZWwgZXZlbnRzIGZvciBtaXNzaW5nIG1vZGVsKVxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MubWlzc2luZ01vZGVsUHJlZml4KSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLm1pc3NpbmdNb2RlbFByZWZpeCksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKHNldHRpbmdzLmZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLnNwbGl0KCdcXG4nKS5sZW5ndGgsIHNldHRpbmdzLnN0YWNrLmxlbmd0aCk7XG5cblx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBQSUkgYnV0IHByZXNlcnZlcyBObyBTdWNoIEZpbGUgZXJyb3IgbWVzc2FnZScsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblxuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdGNvbnN0IG5vU3VjaEZpbGVFcnJvcjogYW55ID0gbmV3IEVycm9yKHNldHRpbmdzLm5vU3VjaEZpbGVNZXNzYWdlKTtcblx0XHRcdG5vU3VjaEZpbGVFcnJvci5zdGFjayA9IHNldHRpbmdzLnN0YWNrO1xuXG5cdFx0XHQvLyBUZXN0IHRoYXQgbm8gZmlsZSBpbmZvcm1hdGlvbiByZW1haW5zLCBidXQgdGhpcyBwYXJ0aWN1bGFyXG5cdFx0XHQvLyBlcnJvciBtZXNzYWdlIGRvZXMgKEVOT0VOVDogbm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeSlcblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihub1N1Y2hGaWxlRXJyb3IpO1xuXHRcdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLm5vU3VjaEZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3Mubm9TdWNoRmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1VuY2F1Z2h0IEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIFBJSSBidXQgcHJlc2VydmVzIE5vIFN1Y2ggRmlsZSBlcnJvciBtZXNzYWdlJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGVycm9yU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRcdG1haW5XaW5kb3cub25lcnJvciA9IGVycm9yU3R1Yjtcblx0XHRcdGNvbnN0IHNldHRpbmdzID0gbmV3IEVycm9yVGVzdGluZ1NldHRpbmdzKCk7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRcdGNvbnN0IG5vU3VjaEZpbGVFcnJvcjogYW55ID0gbmV3IEVycm9yKCdub1N1Y2hGaWxlTWVzc2FnZScpO1xuXHRcdFx0bm9TdWNoRmlsZUVycm9yLnN0YWNrID0gc2V0dGluZ3Muc3RhY2s7XG5cdFx0XHRtYWluV2luZG93Lm9uZXJyb3Ioc2V0dGluZ3Mubm9TdWNoRmlsZU1lc3NhZ2UsICd0ZXN0LmpzJywgMiwgNDIsIG5vU3VjaEZpbGVFcnJvcik7XG5cdFx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnJvclN0dWIuY2FsbENvdW50LCAxKTtcblx0XHRcdC8vIFRlc3QgdGhhdCBubyBmaWxlIGluZm9ybWF0aW9uIHJlbWFpbnMsIGJ1dCB0aGlzIHBhcnRpY3VsYXJcblx0XHRcdC8vIGVycm9yIG1lc3NhZ2UgZG9lcyAoRU5PRU5UOiBubyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5KVxuXHRcdFx0RXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKG5vU3VjaEZpbGVFcnJvcik7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLm5vU3VjaEZpbGVQcmVmaXgpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKHNldHRpbmdzLnBlcnNvbmFsSW5mbyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2Yoc2V0dGluZ3MuZmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3Mubm9TdWNoRmlsZVByZWZpeCksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2Yoc2V0dGluZ3MucGVyc29uYWxJbmZvKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5maWxlUHJlZml4KSwgLTEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihzZXR0aW5ncy5zdGFja1s0XS5yZXBsYWNlKHNldHRpbmdzLnJhbmRvbVVzZXJGaWxlLCBzZXR0aW5ncy5hbm9ueW1pemVkUmFuZG9tVXNlckZpbGUpKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suc3BsaXQoJ1xcbicpLmxlbmd0aCwgc2V0dGluZ3Muc3RhY2subGVuZ3RoKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1RlbGVtZXRyeSBTZXJ2aWNlIHNlbmRzIGV2ZW50cyB3aGVuIHRlbGVtZXRyeSBpcyBvbicsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9LCBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cdFx0c2VydmljZS5wdWJsaWNMb2coJ3Rlc3RFdmVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZ2V0RXZlbnRzQ291bnQoKSwgMSk7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdUZWxlbWV0cnkgU2VydmljZSBjaGVja3Mgd2l0aCBjb25maWcgc2VydmljZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uT0ZGO1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxhbnk+KCk7XG5cblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZWxlbWV0cnlTZXJ2aWNlKHtcblx0XHRcdGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl1cblx0XHR9LCBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gZW1pdHRlci5ldmVudDtcblx0XHRcdG92ZXJyaWRlIGdldFZhbHVlPFQ+KCk6IFQge1xuXHRcdFx0XHRyZXR1cm4gdGVsZW1ldHJ5TGV2ZWwgYXMgVDtcblx0XHRcdH1cblx0XHR9KCksIFRlc3RQcm9kdWN0U2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZWxlbWV0cnlMZXZlbCwgVGVsZW1ldHJ5TGV2ZWwuTk9ORSk7XG5cblx0XHR0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uT047XG5cdFx0ZW1pdHRlci5maXJlKHsgYWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UudGVsZW1ldHJ5TGV2ZWwsIFRlbGVtZXRyeUxldmVsLlVTQUdFKTtcblxuXHRcdHRlbGVtZXRyeUxldmVsID0gVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5FUlJPUjtcblx0XHRlbWl0dGVyLmZpcmUoeyBhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS50ZWxlbWV0cnlMZXZlbCwgVGVsZW1ldHJ5TGV2ZWwuRVJST1IpO1xuXG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgV2luZG93cyBQSUkgYnV0IHByZXNlcnZlcyBjb2RlIHBhdGgnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB3aW5kb3dzVXNlclBhdGggPSAnYzovVXNlcnMvYnBhc2Vyby9BcHBEYXRhL0xvY2FsL1Byb2dyYW1zL01pY3Jvc29mdCUyMFZTJTIwQ29kZSUyMEluc2lkZXJzL3Jlc291cmNlcy9hcHAvJztcblx0XHRcdGNvbnN0IGNvZGVQYXRoID0gJ291dC92cy93b3JrYmVuY2gvd29ya2JlbmNoLmRlc2t0b3AubWFpbi5qcyc7XG5cdFx0XHRjb25zdCBzdGFjayA9IFtcblx0XHRcdFx0YCAgICBhdCBjVGUuZ2MgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke3dpbmRvd3NVc2VyUGF0aH0ke2NvZGVQYXRofToyNzI0OjgxNDkyKWAsXG5cdFx0XHRcdGAgICAgYXQgYXN5bmMgY1RlLnNldElucHV0ICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHt3aW5kb3dzVXNlclBhdGh9JHtjb2RlUGF0aH06MjcyNDo4MDY1MClgLFxuXHRcdFx0XHRgICAgIGF0IGFzeW5jIHFKZS5TICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHt3aW5kb3dzVXNlclBhdGh9JHtjb2RlUGF0aH06Njk4OjU4NTIwKWAsXG5cdFx0XHRcdGAgICAgYXQgYXN5bmMgcUplLkwgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke3dpbmRvd3NVc2VyUGF0aH0ke2NvZGVQYXRofTo2OTg6NTcwODApYCxcblx0XHRcdFx0YCAgICBhdCBhc3luYyBxSmUub3BlbkVkaXRvciAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7d2luZG93c1VzZXJQYXRofSR7Y29kZVBhdGh9OjY5ODo1NjE2MilgXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCB3aW5kb3dzRXJyb3I6IGFueSA9IG5ldyBFcnJvcignVGhlIGVkaXRvciBjb3VsZCBub3QgYmUgb3BlbmVkIGJlY2F1c2UgdGhlIGZpbGUgd2FzIG5vdCBmb3VuZC4nKTtcblx0XHRcdHdpbmRvd3NFcnJvci5zdGFjayA9IHN0YWNrLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRFcnJvcnMub25VbmV4cGVjdGVkRXJyb3Iod2luZG93c0Vycm9yKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRcdC8vIFZlcmlmeSBQSUkgKHVzZXJuYW1lIGFuZCBwYXRoKSBpcyByZW1vdmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdicGFzZXJvJyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ1VzZXJzJyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ2M6L1VzZXJzJyksIC0xKTtcblx0XHRcdC8vIFZlcmlmeSBpbXBvcnRhbnQgY29kZSBwYXRoIGlzIHByZXNlcnZlZFxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihjb2RlUGF0aCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ291dC92cy93b3JrYmVuY2gnKSwgLTEpO1xuXG5cdFx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5jYXVnaHQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgV2luZG93cyBQSUkgYnV0IHByZXNlcnZlcyBjb2RlIHBhdGgnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3QgZXJyb3JTdHViID0gc2lub24uc3R1YigpO1xuXHRcdG1haW5XaW5kb3cub25lcnJvciA9IGVycm9yU3R1YjtcblxuXHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RFcnJvclRlbGVtZXRyeVNlcnZpY2UoeyBhcHBlbmRlcnM6IFt0ZXN0QXBwZW5kZXJdIH0pO1xuXHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2luZG93c1VzZXJQYXRoID0gJ2M6L1VzZXJzL2JwYXNlcm8vQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQlMjBWUyUyMENvZGUlMjBJbnNpZGVycy9yZXNvdXJjZXMvYXBwLyc7XG5cdFx0Y29uc3QgY29kZVBhdGggPSAnb3V0L3ZzL3dvcmtiZW5jaC93b3JrYmVuY2guZGVza3RvcC5tYWluLmpzJztcblx0XHRjb25zdCBzdGFjayA9IFtcblx0XHRcdGAgICAgYXQgY1RlLmdjICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHt3aW5kb3dzVXNlclBhdGh9JHtjb2RlUGF0aH06MjcyNDo4MTQ5MilgLFxuXHRcdFx0YCAgICBhdCBhc3luYyBjVGUuc2V0SW5wdXQgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke3dpbmRvd3NVc2VyUGF0aH0ke2NvZGVQYXRofToyNzI0OjgwNjUwKWAsXG5cdFx0XHRgICAgIGF0IGFzeW5jIHFKZS5TICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHt3aW5kb3dzVXNlclBhdGh9JHtjb2RlUGF0aH06Njk4OjU4NTIwKWBcblx0XHRdO1xuXG5cdFx0Y29uc3Qgd2luZG93c0Vycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ1RoZSBlZGl0b3IgY291bGQgbm90IGJlIG9wZW5lZCBiZWNhdXNlIHRoZSBmaWxlIHdhcyBub3QgZm91bmQuJyk7XG5cdFx0d2luZG93c0Vycm9yLnN0YWNrID0gc3RhY2suam9pbignXFxuJyk7XG5cblx0XHRtYWluV2luZG93Lm9uZXJyb3IoJ1RoZSBlZGl0b3IgY291bGQgbm90IGJlIG9wZW5lZCBiZWNhdXNlIHRoZSBmaWxlIHdhcyBub3QgZm91bmQuJywgJ3Rlc3QuanMnLCAyLCA0Miwgd2luZG93c0Vycm9yKTtcblx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0Ly8gVmVyaWZ5IFBJSSAodXNlcm5hbWUgYW5kIHBhdGgpIGlzIHJlbW92ZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdicGFzZXJvJyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdVc2VycycpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignYzovVXNlcnMnKSwgLTEpO1xuXHRcdC8vIFZlcmlmeSBpbXBvcnRhbnQgY29kZSBwYXRoIGlzIHByZXNlcnZlZFxuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoY29kZVBhdGgpLCAtMSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignb3V0L3ZzL3dvcmtiZW5jaCcpLCAtMSk7XG5cblx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0c2lub24ucmVzdG9yZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnVW5leHBlY3RlZCBFcnJvciBUZWxlbWV0cnkgcmVtb3ZlcyBtYWNPUyBQSUkgYnV0IHByZXNlcnZlcyBjb2RlIHBhdGgnLCBzaW5vblRlc3RGbihmdW5jdGlvbiAodGhpczogYW55KSB7XG5cdFx0Y29uc3Qgb3JpZ0Vycm9ySGFuZGxlciA9IEVycm9ycy5lcnJvckhhbmRsZXIuZ2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigpO1xuXHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCgpID0+IHsgfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBtYWNVc2VyUGF0aCA9ICdBcHBsaWNhdGlvbnMvVmlzdWFsJTIwU3R1ZGlvJTIwQ29kZSUyMC0lMjBJbnNpZGVycy5hcHAvQ29udGVudHMvUmVzb3VyY2VzL2FwcC8nO1xuXHRcdFx0Y29uc3QgY29kZVBhdGggPSAnb3V0L3ZzL3dvcmtiZW5jaC93b3JrYmVuY2guZGVza3RvcC5tYWluLmpzJztcblx0XHRcdGNvbnN0IHN0YWNrID0gW1xuXHRcdFx0XHRgICAgIGF0IHVUZS5nYyAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bWFjVXNlclBhdGh9JHtjb2RlUGF0aH06MjcyMDo4MTQ5MilgLFxuXHRcdFx0XHRgICAgIGF0IGFzeW5jIHVUZS5zZXRJbnB1dCAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bWFjVXNlclBhdGh9JHtjb2RlUGF0aH06MjcyMDo4MDY1MClgLFxuXHRcdFx0XHRgICAgIGF0IGFzeW5jIEpKZS5TICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHttYWNVc2VyUGF0aH0ke2NvZGVQYXRofTo2OTg6NTg1MjApYCxcblx0XHRcdFx0YCAgICBhdCBhc3luYyBKSmUuTCAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bWFjVXNlclBhdGh9JHtjb2RlUGF0aH06Njk4OjU3MDgwKWAsXG5cdFx0XHRcdGAgICAgYXQgYXN5bmMgSkplLm9wZW5FZGl0b3IgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke21hY1VzZXJQYXRofSR7Y29kZVBhdGh9OjY5ODo1NjE2MilgXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBtYWNFcnJvcjogYW55ID0gbmV3IEVycm9yKCdUaGUgZWRpdG9yIGNvdWxkIG5vdCBiZSBvcGVuZWQgYmVjYXVzZSB0aGUgZmlsZSB3YXMgbm90IGZvdW5kLicpO1xuXHRcdFx0bWFjRXJyb3Iuc3RhY2sgPSBzdGFjay5qb2luKCdcXG4nKTtcblxuXHRcdFx0RXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKG1hY0Vycm9yKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRcdC8vIFZlcmlmeSBQSUkgKGFwcGxpY2F0aW9uIHBhdGgpIGlzIHJlbW92ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ0FwcGxpY2F0aW9ucy9WaXN1YWwnKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignVmlzdWFsJTIwU3R1ZGlvJTIwQ29kZScpLCAtMSk7XG5cdFx0XHQvLyBWZXJpZnkgaW1wb3J0YW50IGNvZGUgcGF0aCBpcyBwcmVzZXJ2ZWRcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoY29kZVBhdGgpLCAtMSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdvdXQvdnMvd29ya2JlbmNoJyksIC0xKTtcblxuXHRcdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdEVycm9ycy5zZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKG9yaWdFcnJvckhhbmRsZXIpO1xuXHRcdH1cblx0fSkpO1xuXG5cdHRlc3QoJ1VuY2F1Z2h0IEVycm9yIFRlbGVtZXRyeSByZW1vdmVzIG1hY09TIFBJSSBidXQgcHJlc2VydmVzIGNvZGUgcGF0aCcsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBlcnJvclN0dWIgPSBzaW5vbi5zdHViKCk7XG5cdFx0bWFpbldpbmRvdy5vbmVycm9yID0gZXJyb3JTdHViO1xuXG5cdFx0Y29uc3QgdGVzdEFwcGVuZGVyID0gbmV3IFRlc3RUZWxlbWV0cnlBcHBlbmRlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0Y29uc3QgZXJyb3JUZWxlbWV0cnkgPSBuZXcgRXJyb3JUZWxlbWV0cnkoc2VydmljZSk7XG5cblx0XHRjb25zdCBtYWNVc2VyUGF0aCA9ICdBcHBsaWNhdGlvbnMvVmlzdWFsJTIwU3R1ZGlvJTIwQ29kZSUyMC0lMjBJbnNpZGVycy5hcHAvQ29udGVudHMvUmVzb3VyY2VzL2FwcC8nO1xuXHRcdGNvbnN0IGNvZGVQYXRoID0gJ291dC92cy93b3JrYmVuY2gvd29ya2JlbmNoLmRlc2t0b3AubWFpbi5qcyc7XG5cdFx0Y29uc3Qgc3RhY2sgPSBbXG5cdFx0XHRgICAgIGF0IHVUZS5nYyAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bWFjVXNlclBhdGh9JHtjb2RlUGF0aH06MjcyMDo4MTQ5MilgLFxuXHRcdFx0YCAgICBhdCBhc3luYyB1VGUuc2V0SW5wdXQgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke21hY1VzZXJQYXRofSR7Y29kZVBhdGh9OjI3MjA6ODA2NTApYCxcblx0XHRcdGAgICAgYXQgYXN5bmMgSkplLlMgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke21hY1VzZXJQYXRofSR7Y29kZVBhdGh9OjY5ODo1ODUyMClgXG5cdFx0XTtcblxuXHRcdGNvbnN0IG1hY0Vycm9yOiBhbnkgPSBuZXcgRXJyb3IoJ1RoZSBlZGl0b3IgY291bGQgbm90IGJlIG9wZW5lZCBiZWNhdXNlIHRoZSBmaWxlIHdhcyBub3QgZm91bmQuJyk7XG5cdFx0bWFjRXJyb3Iuc3RhY2sgPSBzdGFjay5qb2luKCdcXG4nKTtcblxuXHRcdG1haW5XaW5kb3cub25lcnJvcignVGhlIGVkaXRvciBjb3VsZCBub3QgYmUgb3BlbmVkIGJlY2F1c2UgdGhlIGZpbGUgd2FzIG5vdCBmb3VuZC4nLCAndGVzdC5qcycsIDIsIDQyLCBtYWNFcnJvcik7XG5cdFx0dGhpcy5jbG9jay50aWNrKEVycm9yVGVsZW1ldHJ5LkVSUk9SX0ZMVVNIX1RJTUVPVVQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVycm9yU3R1Yi5jYWxsQ291bnQsIDEpO1xuXHRcdC8vIFZlcmlmeSBQSUkgKGFwcGxpY2F0aW9uIHBhdGgpIGlzIHJlbW92ZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdBcHBsaWNhdGlvbnMvVmlzdWFsJyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdWaXN1YWwlMjBTdHVkaW8lMjBDb2RlJyksIC0xKTtcblx0XHQvLyBWZXJpZnkgaW1wb3J0YW50IGNvZGUgcGF0aCBpcyBwcmVzZXJ2ZWRcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKGNvZGVQYXRoKSwgLTEpO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ291dC92cy93b3JrYmVuY2gnKSwgLTEpO1xuXG5cdFx0ZXJyb3JUZWxlbWV0cnkuZGlzcG9zZSgpO1xuXHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdHNpbm9uLnJlc3RvcmUoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ1VuZXhwZWN0ZWQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgTGludXggUElJIGJ1dCBwcmVzZXJ2ZXMgY29kZSBwYXRoJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IG9yaWdFcnJvckhhbmRsZXIgPSBFcnJvcnMuZXJyb3JIYW5kbGVyLmdldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKTtcblx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcigoKSA9PiB7IH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRlc3RBcHBlbmRlciA9IG5ldyBUZXN0VGVsZW1ldHJ5QXBwZW5kZXIoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0gfSk7XG5cdFx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgbGludXhVc2VyUGF0aCA9ICcvaG9tZS9wYXJhbGxlbHMvR2l0RGV2ZWxvcG1lbnQvdnNjb2RlLW5vZGUtc3FsaXRlMy1wZXJmLyc7XG5cdFx0XHRjb25zdCBsaW51eFN5c3RlbVBhdGggPSAndXNyL3NoYXJlL2NvZGUtaW5zaWRlcnMvcmVzb3VyY2VzL2FwcC8nO1xuXHRcdFx0Y29uc3QgY29kZVBhdGggPSAnb3V0L3ZzL3dvcmtiZW5jaC93b3JrYmVuY2guZGVza3RvcC5tYWluLmpzJztcblx0XHRcdGNvbnN0IHN0YWNrID0gW1xuXHRcdFx0XHRgICAgIGF0IF9rdC5HICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHtsaW51eFN5c3RlbVBhdGh9JHtjb2RlUGF0aH06MzgyNTo2NTk0MClgLFxuXHRcdFx0XHRgICAgIGF0IF9rdC5GICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHtsaW51eFN5c3RlbVBhdGh9JHtjb2RlUGF0aH06MzgyNTo2NTc2NSlgLFxuXHRcdFx0XHRgICAgIGF0IGFzeW5jIGF4dC5MICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHtsaW51eFN5c3RlbVBhdGh9JHtjb2RlUGF0aH06MzgzMDo5OTk4KWAsXG5cdFx0XHRcdGAgICAgYXQgYXN5bmMgYXh0LnJlYWRTdHJlYW0gKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke2xpbnV4U3lzdGVtUGF0aH0ke2NvZGVQYXRofTozODMwOjk3NzMpYCxcblx0XHRcdFx0YCAgICBhdCBhc3luYyBteWUuRWIgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke2xpbnV4U3lzdGVtUGF0aH0ke2NvZGVQYXRofToxMzEzOjEyMzU5KWBcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGxpbnV4RXJyb3I6IGFueSA9IG5ldyBFcnJvcihgSW52YWxpZCBmYWtlIGZpbGUgJ2dpdDoke2xpbnV4VXNlclBhdGh9aW5kZXguanMuZ2l0P3tcInBhdGhcIjpcIiR7bGludXhVc2VyUGF0aH1pbmRleC5qc1wiLFwicmVmXCI6XCJcIn0nIChDYW5jZWxlZDogQ2FuY2VsZWQpYCk7XG5cdFx0XHRsaW51eEVycm9yLnN0YWNrID0gc3RhY2suam9pbignXFxuJyk7XG5cblx0XHRcdEVycm9ycy5vblVuZXhwZWN0ZWRFcnJvcihsaW51eEVycm9yKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRcdC8vIFZlcmlmeSBQSUkgKHVzZXJuYW1lIGFuZCBob21lIGRpcmVjdG9yeSkgaXMgcmVtb3ZlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZigncGFyYWxsZWxzJyksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2YoJy9ob21lL3BhcmFsbGVscycpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKCdHaXREZXZlbG9wbWVudCcpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdwYXJhbGxlbHMnKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZignL2hvbWUvcGFyYWxsZWxzJyksIC0xKTtcblx0XHRcdC8vIFZlcmlmeSBpbXBvcnRhbnQgY29kZSBwYXRoIGlzIHByZXNlcnZlZFxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihjb2RlUGF0aCksIC0xKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJ291dC92cy93b3JrYmVuY2gnKSwgLTEpO1xuXG5cdFx0XHRlcnJvclRlbGVtZXRyeS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIob3JpZ0Vycm9ySGFuZGxlcik7XG5cdFx0fVxuXHR9KSk7XG5cblx0dGVzdCgnVW5jYXVnaHQgRXJyb3IgVGVsZW1ldHJ5IHJlbW92ZXMgTGludXggUElJIGJ1dCBwcmVzZXJ2ZXMgY29kZSBwYXRoJywgc2lub25UZXN0Rm4oZnVuY3Rpb24gKHRoaXM6IGFueSkge1xuXHRcdGNvbnN0IGVycm9yU3R1YiA9IHNpbm9uLnN0dWIoKTtcblx0XHRtYWluV2luZG93Lm9uZXJyb3IgPSBlcnJvclN0dWI7XG5cblx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0RXJyb3JUZWxlbWV0cnlTZXJ2aWNlKHsgYXBwZW5kZXJzOiBbdGVzdEFwcGVuZGVyXSB9KTtcblx0XHRjb25zdCBlcnJvclRlbGVtZXRyeSA9IG5ldyBFcnJvclRlbGVtZXRyeShzZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGxpbnV4VXNlclBhdGggPSAnL2hvbWUvcGFyYWxsZWxzL0dpdERldmVsb3BtZW50L3ZzY29kZS1ub2RlLXNxbGl0ZTMtcGVyZi8nO1xuXHRcdGNvbnN0IGxpbnV4U3lzdGVtUGF0aCA9ICd1c3Ivc2hhcmUvY29kZS1pbnNpZGVycy9yZXNvdXJjZXMvYXBwLyc7XG5cdFx0Y29uc3QgY29kZVBhdGggPSAnb3V0L3ZzL3dvcmtiZW5jaC93b3JrYmVuY2guZGVza3RvcC5tYWluLmpzJztcblx0XHRjb25zdCBzdGFjayA9IFtcblx0XHRcdGAgICAgYXQgX2t0LkcgKHZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC8ke2xpbnV4U3lzdGVtUGF0aH0ke2NvZGVQYXRofTozODI1OjY1OTQwKWAsXG5cdFx0XHRgICAgIGF0IF9rdC5GICh2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvJHtsaW51eFN5c3RlbVBhdGh9JHtjb2RlUGF0aH06MzgyNTo2NTc2NSlgLFxuXHRcdFx0YCAgICBhdCBhc3luYyBheHQuTCAodnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwLyR7bGludXhTeXN0ZW1QYXRofSR7Y29kZVBhdGh9OjM4MzA6OTk5OClgXG5cdFx0XTtcblxuXHRcdGNvbnN0IGxpbnV4RXJyb3I6IGFueSA9IG5ldyBFcnJvcihgVW5hYmxlIHRvIHJlYWQgZmlsZSAnZ2l0OiR7bGludXhVc2VyUGF0aH1pbmRleC5qcy5naXQnYCk7XG5cdFx0bGludXhFcnJvci5zdGFjayA9IHN0YWNrLmpvaW4oJ1xcbicpO1xuXG5cdFx0bWFpbldpbmRvdy5vbmVycm9yKGBVbmFibGUgdG8gcmVhZCBmaWxlICdnaXQ6JHtsaW51eFVzZXJQYXRofWluZGV4LmpzLmdpdCdgLCAndGVzdC5qcycsIDIsIDQyLCBsaW51eEVycm9yKTtcblx0XHR0aGlzLmNsb2NrLnRpY2soRXJyb3JUZWxlbWV0cnkuRVJST1JfRkxVU0hfVElNRU9VVCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTdHViLmNhbGxDb3VudCwgMSk7XG5cdFx0Ly8gVmVyaWZ5IFBJSSAodXNlcm5hbWUgYW5kIGhvbWUgZGlyZWN0b3J5KSBpcyByZW1vdmVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5tc2cuaW5kZXhPZigncGFyYWxsZWxzJyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLm1zZy5pbmRleE9mKCcvaG9tZS9wYXJhbGxlbHMnKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEubXNnLmluZGV4T2YoJ0dpdERldmVsb3BtZW50JyksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdwYXJhbGxlbHMnKSwgLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0QXBwZW5kZXIuZXZlbnRzWzBdLmRhdGEuY2FsbHN0YWNrLmluZGV4T2YoJy9ob21lL3BhcmFsbGVscycpLCAtMSk7XG5cdFx0Ly8gVmVyaWZ5IGltcG9ydGFudCBjb2RlIHBhdGggaXMgcHJlc2VydmVkXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5ldmVudHNbMF0uZGF0YS5jYWxsc3RhY2suaW5kZXhPZihjb2RlUGF0aCksIC0xKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjay5pbmRleE9mKCdvdXQvdnMvd29ya2JlbmNoJyksIC0xKTtcblxuXHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRzaW5vbi5yZXN0b3JlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdVbmV4cGVjdGVkIEVycm9yIFRlbGVtZXRyeSBzdHJpcHMgd2ViIG9yaWdpbiBidXQgcHJlc2VydmVzIHBhdGggaW4gd2ViIHN0YWNrIHRyYWNlcyB3aGVuIHBpaVBhdGhzIGluY2x1ZGVzIG9yaWdpbicsIHNpbm9uVGVzdEZuKGZ1bmN0aW9uICh0aGlzOiBhbnkpIHtcblx0XHRjb25zdCBvcmlnRXJyb3JIYW5kbGVyID0gRXJyb3JzLmVycm9ySGFuZGxlci5nZXRVbmV4cGVjdGVkRXJyb3JIYW5kbGVyKCk7XG5cdFx0RXJyb3JzLnNldFVuZXhwZWN0ZWRFcnJvckhhbmRsZXIoKCkgPT4geyB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0ZXN0QXBwZW5kZXIgPSBuZXcgVGVzdFRlbGVtZXRyeUFwcGVuZGVyKCk7XG5cdFx0XHRjb25zdCB3ZWJPcmlnaW4gPSAnaHR0cHM6Ly9jb2Rlc3BhY2UtaG9zdC5naXRodWIuZGV2Jztcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdEVycm9yVGVsZW1ldHJ5U2VydmljZSh7IGFwcGVuZGVyczogW3Rlc3RBcHBlbmRlcl0sIHBpaVBhdGhzOiBbd2ViT3JpZ2luXSB9KTtcblx0XHRcdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gbmV3IEVycm9yVGVsZW1ldHJ5KHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBidW5kbGVQYXRoID0gJy9zdGF0aWMvYnVpbGQvYnVuZGxlLmpzJztcblx0XHRcdGNvbnN0IHN0YWNrID0gW1xuXHRcdFx0XHRgRXJyb3I6IFNvbWV0aGluZyBmYWlsZWRgLFxuXHRcdFx0XHRgICAgIGF0IHgzdC5fZGVsZWdhdGUgKCR7d2ViT3JpZ2lufSR7YnVuZGxlUGF0aH06MToyMDA5NTMpYCxcblx0XHRcdFx0YCAgICBhdCB5NHUucnVuICgke3dlYk9yaWdpbn0ke2J1bmRsZVBhdGh9OjE6MzA0ODIyKWAsXG5cdFx0XHRcdGAgICAgYXQgRGVkaWNhdGVkV29ya2VyR2xvYmFsU2NvcGUuc2VsZi5vbm1lc3NhZ2VgLFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3Qgd2ViRXJyb3I6IGFueSA9IG5ldyBFcnJvcignU29tZXRoaW5nIGZhaWxlZCcpO1xuXHRcdFx0d2ViRXJyb3Iuc3RhY2sgPSBzdGFjay5qb2luKCdcXG4nKTtcblxuXHRcdFx0RXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKHdlYkVycm9yKTtcblx0XHRcdHRoaXMuY2xvY2sudGljayhFcnJvclRlbGVtZXRyeS5FUlJPUl9GTFVTSF9USU1FT1VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RBcHBlbmRlci5nZXRFdmVudHNDb3VudCgpLCAxKTtcblx0XHRcdGNvbnN0IGNzID0gdGVzdEFwcGVuZGVyLmV2ZW50c1swXS5kYXRhLmNhbGxzdGFjaztcblx0XHRcdC8vIFZlcmlmeSB0aGUgd2ViIG9yaWdpbiBpcyBzdHJpcHBlZCAobm90IGxlYWtlZCBhcyBQSUkpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3MuaW5kZXhPZih3ZWJPcmlnaW4pLCAtMSwgJ1dlYiBvcmlnaW4gc2hvdWxkIGJlIHN0cmlwcGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3MuaW5kZXhPZignaHR0cHM6Ly8nKSwgLTEsICdIVFRQUyBzY2hlbWUgc2hvdWxkIGJlIHN0cmlwcGVkJyk7XG5cdFx0XHQvLyBWZXJpZnkgdGhlIGJ1bmRsZSBwYXRoIGlzIHByZXNlcnZlZCBmb3IgZGVidWdnaW5nXG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY3MuaW5kZXhPZihidW5kbGVQYXRoKSwgLTEsICdCdW5kbGUgcGF0aCBzaG91bGQgYmUgcHJlc2VydmVkJyk7XG5cblx0XHRcdGVycm9yVGVsZW1ldHJ5LmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRFcnJvcnMuc2V0VW5leHBlY3RlZEVycm9ySGFuZGxlcihvcmlnRXJyb3JIYW5kbGVyKTtcblx0XHR9XG5cdH0pKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFlBQVksV0FBVztBQUN2QixPQUFPLGVBQWU7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxPQUFPLGFBQWE7QUFFcEIsT0FBTyxvQkFBb0I7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
