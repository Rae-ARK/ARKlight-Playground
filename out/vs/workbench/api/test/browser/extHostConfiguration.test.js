import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostWorkspace } from "../../common/extHostWorkspace.js";
import { ExtHostConfigProvider } from "../../common/extHostConfiguration.js";
import { ConfigurationModel, ConfigurationModelParser } from "../../../../platform/configuration/common/configurationModels.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { mock } from "../../../../base/test/common/mock.js";
import { WorkspaceFolder } from "../../../../platform/workspace/common/workspace.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { FileSystemProviderCapabilities } from "../../../../platform/files/common/files.js";
import { isLinux } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostConfiguration", function() {
  class RecordingShape extends mock() {
    $updateConfigurationOption(target, key, value) {
      this.lastArgs = [target, key, value];
      return Promise.resolve(void 0);
    }
  }
  function createExtHostWorkspace() {
    return new ExtHostWorkspace(new TestRPCProtocol(), new class extends mock() {
    }(), new class extends mock() {
      getCapabilities() {
        return isLinux ? FileSystemProviderCapabilities.PathCaseSensitive : void 0;
      }
    }(), new NullLogService(), new class extends mock() {
    }());
  }
  function createExtHostConfiguration(contents = /* @__PURE__ */ Object.create(null), shape) {
    if (!shape) {
      shape = new class extends mock() {
      }();
    }
    return new ExtHostConfigProvider(shape, createExtHostWorkspace(), createConfigurationData(contents), new NullLogService());
  }
  function createConfigurationData(contents) {
    return {
      defaults: new ConfigurationModel(contents, [], [], void 0, new NullLogService()),
      policy: ConfigurationModel.createEmptyModel(new NullLogService()),
      application: ConfigurationModel.createEmptyModel(new NullLogService()),
      userLocal: new ConfigurationModel(contents, [], [], void 0, new NullLogService()),
      userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
      workspace: ConfigurationModel.createEmptyModel(new NullLogService()),
      folders: [],
      configurationScopes: []
    };
  }
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("getConfiguration fails regression test 1.7.1 -> 1.8 #15552", function() {
    const extHostConfig = createExtHostConfiguration({
      "search": {
        "exclude": {
          "**/node_modules": true
        }
      }
    });
    assert.strictEqual(extHostConfig.getConfiguration("search.exclude")["**/node_modules"], true);
    assert.strictEqual(extHostConfig.getConfiguration("search.exclude").get("**/node_modules"), true);
    assert.strictEqual(extHostConfig.getConfiguration("search").get("exclude")["**/node_modules"], true);
    assert.strictEqual(extHostConfig.getConfiguration("search.exclude").has("**/node_modules"), true);
    assert.strictEqual(extHostConfig.getConfiguration("search").has("exclude.**/node_modules"), true);
  });
  test("has/get", () => {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      }
    });
    const config = all.getConfiguration("farboo");
    assert.ok(config.has("config0"));
    assert.strictEqual(config.get("config0"), true);
    assert.strictEqual(config.get("config4"), "");
    assert.strictEqual(config["config0"], true);
    assert.strictEqual(config["config4"], "");
    assert.ok(config.has("nested.config1"));
    assert.strictEqual(config.get("nested.config1"), 42);
    assert.ok(config.has("nested.config2"));
    assert.strictEqual(config.get("nested.config2"), "Das Pferd frisst kein Reis.");
    assert.ok(config.has("nested"));
    assert.deepStrictEqual(config.get("nested"), { config1: 42, config2: "Das Pferd frisst kein Reis." });
  });
  test("get nested config", () => {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      }
    });
    assert.deepStrictEqual(all.getConfiguration("farboo.nested").get("config1"), 42);
    assert.deepStrictEqual(all.getConfiguration("farboo.nested").get("config2"), "Das Pferd frisst kein Reis.");
    assert.deepStrictEqual(all.getConfiguration("farboo.nested")["config1"], 42);
    assert.deepStrictEqual(all.getConfiguration("farboo.nested")["config2"], "Das Pferd frisst kein Reis.");
    assert.deepStrictEqual(all.getConfiguration("farboo.nested1").get("config1"), void 0);
    assert.deepStrictEqual(all.getConfiguration("farboo.nested1").get("config2"), void 0);
    assert.deepStrictEqual(all.getConfiguration("farboo.config0.config1").get("a"), void 0);
    assert.deepStrictEqual(all.getConfiguration("farboo.config0.config1")["a"], void 0);
  });
  test("can modify the returned configuration", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      },
      "workbench": {
        "colorCustomizations": {
          "statusBar.foreground": "somevalue"
        }
      }
    });
    let testObject = all.getConfiguration();
    let actual = testObject.get("farboo");
    actual["nested"]["config1"] = 41;
    assert.strictEqual(41, actual["nested"]["config1"]);
    actual["farboo1"] = "newValue";
    assert.strictEqual("newValue", actual["farboo1"]);
    testObject = all.getConfiguration();
    actual = testObject.get("farboo");
    assert.strictEqual(actual["nested"]["config1"], 42);
    assert.strictEqual(actual["farboo1"], void 0);
    testObject = all.getConfiguration();
    actual = testObject.get("farboo");
    assert.strictEqual(actual["config0"], true);
    actual["config0"] = false;
    assert.strictEqual(actual["config0"], false);
    testObject = all.getConfiguration();
    actual = testObject.get("farboo");
    assert.strictEqual(actual["config0"], true);
    testObject = all.getConfiguration();
    actual = testObject.inspect("farboo");
    actual["value"] = "effectiveValue";
    assert.strictEqual("effectiveValue", actual["value"]);
    testObject = all.getConfiguration("workbench");
    actual = testObject.get("colorCustomizations");
    actual["statusBar.foreground"] = void 0;
    assert.strictEqual(actual["statusBar.foreground"], void 0);
    testObject = all.getConfiguration("workbench");
    actual = testObject.get("colorCustomizations");
    assert.strictEqual(actual["statusBar.foreground"], "somevalue");
  });
  test("Stringify returned configuration", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      },
      "workbench": {
        "colorCustomizations": {
          "statusBar.foreground": "somevalue"
        },
        "emptyobjectkey": {}
      }
    });
    const testObject = all.getConfiguration();
    let actual = testObject.get("farboo");
    assert.deepStrictEqual(JSON.stringify({
      "config0": true,
      "nested": {
        "config1": 42,
        "config2": "Das Pferd frisst kein Reis."
      },
      "config4": ""
    }), JSON.stringify(actual));
    assert.deepStrictEqual(void 0, JSON.stringify(testObject.get("unknownkey")));
    actual = testObject.get("farboo");
    actual["config0"] = false;
    assert.deepStrictEqual(JSON.stringify({
      "config0": false,
      "nested": {
        "config1": 42,
        "config2": "Das Pferd frisst kein Reis."
      },
      "config4": ""
    }), JSON.stringify(actual));
    actual = testObject.get("workbench")["colorCustomizations"];
    actual["statusBar.background"] = "anothervalue";
    assert.deepStrictEqual(JSON.stringify({
      "statusBar.foreground": "somevalue",
      "statusBar.background": "anothervalue"
    }), JSON.stringify(actual));
    actual = testObject.get("workbench");
    actual["unknownkey"] = "somevalue";
    assert.deepStrictEqual(JSON.stringify({
      "colorCustomizations": {
        "statusBar.foreground": "somevalue"
      },
      "emptyobjectkey": {},
      "unknownkey": "somevalue"
    }), JSON.stringify(actual));
    actual = all.getConfiguration("workbench").get("emptyobjectkey");
    actual = {
      ...actual || {},
      "statusBar.background": `#0ff`,
      "statusBar.foreground": `#ff0`
    };
    assert.deepStrictEqual(JSON.stringify({
      "statusBar.background": `#0ff`,
      "statusBar.foreground": `#ff0`
    }), JSON.stringify(actual));
    actual = all.getConfiguration("workbench").get("unknownkey");
    actual = {
      ...actual || {},
      "statusBar.background": `#0ff`,
      "statusBar.foreground": `#ff0`
    };
    assert.deepStrictEqual(JSON.stringify({
      "statusBar.background": `#0ff`,
      "statusBar.foreground": `#ff0`
    }), JSON.stringify(actual));
  });
  test("cannot modify returned configuration", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "nested": {
          "config1": 42,
          "config2": "Das Pferd frisst kein Reis."
        },
        "config4": ""
      }
    });
    const testObject = all.getConfiguration();
    try {
      testObject["get"] = null;
      assert.fail("This should be readonly");
    } catch (e) {
    }
    try {
      testObject["farboo"]["config0"] = false;
      assert.fail("This should be readonly");
    } catch (e) {
    }
    try {
      testObject["farboo"]["farboo1"] = "hello";
      assert.fail("This should be readonly");
    } catch (e) {
    }
  });
  test("inspect in no workspace context", function() {
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      createExtHostWorkspace(),
      {
        defaults: new ConfigurationModel({
          "editor": {
            "wordWrap": "off",
            "lineNumbers": "on",
            "fontSize": "12px"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: ConfigurationModel.createEmptyModel(new NullLogService()),
        userLocal: new ConfigurationModel({
          "editor": {
            "wordWrap": "on",
            "lineNumbers": "off"
          }
        }, ["editor.wordWrap", "editor.lineNumbers"], [], void 0, new NullLogService()),
        userRemote: new ConfigurationModel({
          "editor": {
            "lineNumbers": "relative"
          }
        }, ["editor.lineNumbers"], [], {
          "editor": {
            "lineNumbers": "relative",
            "fontSize": "14px"
          }
        }, new NullLogService()),
        workspace: new ConfigurationModel({}, [], [], void 0, new NullLogService()),
        folders: [],
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual = testObject.getConfiguration().inspect("editor.wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalLocalValue, "on");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.globalValue, "on");
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    actual = testObject.getConfiguration("editor").inspect("wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalLocalValue, "on");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.globalValue, "on");
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    actual = testObject.getConfiguration("editor").inspect("lineNumbers");
    assert.strictEqual(actual.defaultValue, "on");
    assert.strictEqual(actual.globalLocalValue, "off");
    assert.strictEqual(actual.globalRemoteValue, "relative");
    assert.strictEqual(actual.globalValue, "relative");
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(testObject.getConfiguration("editor").get("fontSize"), "12px");
    actual = testObject.getConfiguration("editor").inspect("fontSize");
    assert.strictEqual(actual.defaultValue, "12px");
    assert.strictEqual(actual.globalLocalValue, void 0);
    assert.strictEqual(actual.globalRemoteValue, "14px");
    assert.strictEqual(actual.globalValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
  });
  test("inspect in single root context", function() {
    const workspaceUri = URI.file("foo");
    const folders = [];
    const workspace = new ConfigurationModel({
      "editor": {
        "wordWrap": "bounded"
      }
    }, ["editor.wordWrap"], [], void 0, new NullLogService());
    folders.push([workspaceUri, workspace]);
    const extHostWorkspace = createExtHostWorkspace();
    extHostWorkspace.$initializeWorkspace({
      "id": "foo",
      "folders": [aWorkspaceFolder(URI.file("foo"), 0)],
      "name": "foo"
    }, true);
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      extHostWorkspace,
      {
        defaults: new ConfigurationModel({
          "editor": {
            "wordWrap": "off"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: ConfigurationModel.createEmptyModel(new NullLogService()),
        userLocal: new ConfigurationModel({
          "editor": {
            "wordWrap": "on"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
        workspace,
        folders,
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual1 = testObject.getConfiguration().inspect("editor.wordWrap");
    assert.strictEqual(actual1.defaultValue, "off");
    assert.strictEqual(actual1.globalLocalValue, "on");
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.globalValue, "on");
    assert.strictEqual(actual1.workspaceValue, "bounded");
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    actual1 = testObject.getConfiguration("editor").inspect("wordWrap");
    assert.strictEqual(actual1.defaultValue, "off");
    assert.strictEqual(actual1.globalLocalValue, "on");
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.globalValue, "on");
    assert.strictEqual(actual1.workspaceValue, "bounded");
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    let actual2 = testObject.getConfiguration(void 0, workspaceUri).inspect("editor.wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "bounded");
    actual2 = testObject.getConfiguration("editor", workspaceUri).inspect("wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "bounded");
  });
  test("inspect in multi root context", function() {
    const workspace = new ConfigurationModel({
      "editor": {
        "wordWrap": "bounded"
      }
    }, ["editor.wordWrap"], [], void 0, new NullLogService());
    const firstRoot = URI.file("foo1");
    const secondRoot = URI.file("foo2");
    const thirdRoot = URI.file("foo3");
    const folders = [];
    folders.push([firstRoot, new ConfigurationModel({
      "editor": {
        "wordWrap": "off",
        "lineNumbers": "relative"
      }
    }, ["editor.wordWrap"], [], void 0, new NullLogService())]);
    folders.push([secondRoot, new ConfigurationModel({
      "editor": {
        "wordWrap": "on"
      }
    }, ["editor.wordWrap"], [], void 0, new NullLogService())]);
    folders.push([thirdRoot, new ConfigurationModel({}, [], [], void 0, new NullLogService())]);
    const extHostWorkspace = createExtHostWorkspace();
    extHostWorkspace.$initializeWorkspace({
      "id": "foo",
      "folders": [aWorkspaceFolder(firstRoot, 0), aWorkspaceFolder(secondRoot, 1)],
      "name": "foo"
    }, true);
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      extHostWorkspace,
      {
        defaults: new ConfigurationModel({
          "editor": {
            "wordWrap": "off",
            "lineNumbers": "on"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: ConfigurationModel.createEmptyModel(new NullLogService()),
        userLocal: new ConfigurationModel({
          "editor": {
            "wordWrap": "on"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
        workspace,
        folders,
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual1 = testObject.getConfiguration().inspect("editor.wordWrap");
    assert.strictEqual(actual1.defaultValue, "off");
    assert.strictEqual(actual1.globalValue, "on");
    assert.strictEqual(actual1.globalLocalValue, "on");
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.workspaceValue, "bounded");
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    actual1 = testObject.getConfiguration("editor").inspect("wordWrap");
    assert.strictEqual(actual1.defaultValue, "off");
    assert.strictEqual(actual1.globalValue, "on");
    assert.strictEqual(actual1.globalLocalValue, "on");
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.workspaceValue, "bounded");
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    actual1 = testObject.getConfiguration("editor").inspect("lineNumbers");
    assert.strictEqual(actual1.defaultValue, "on");
    assert.strictEqual(actual1.globalValue, void 0);
    assert.strictEqual(actual1.globalLocalValue, void 0);
    assert.strictEqual(actual1.globalRemoteValue, void 0);
    assert.strictEqual(actual1.workspaceValue, void 0);
    assert.strictEqual(actual1.workspaceFolderValue, void 0);
    let actual2 = testObject.getConfiguration(void 0, firstRoot).inspect("editor.wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "off");
    actual2 = testObject.getConfiguration("editor", firstRoot).inspect("wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "off");
    actual2 = testObject.getConfiguration("editor", firstRoot).inspect("lineNumbers");
    assert.strictEqual(actual2.defaultValue, "on");
    assert.strictEqual(actual2.globalValue, void 0);
    assert.strictEqual(actual2.globalLocalValue, void 0);
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, void 0);
    assert.strictEqual(actual2.workspaceFolderValue, "relative");
    actual2 = testObject.getConfiguration(void 0, secondRoot).inspect("editor.wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "on");
    actual2 = testObject.getConfiguration("editor", secondRoot).inspect("wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.strictEqual(actual2.workspaceFolderValue, "on");
    actual2 = testObject.getConfiguration(void 0, thirdRoot).inspect("editor.wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.ok(Object.keys(actual2).indexOf("workspaceFolderValue") !== -1);
    assert.strictEqual(actual2.workspaceFolderValue, void 0);
    actual2 = testObject.getConfiguration("editor", thirdRoot).inspect("wordWrap");
    assert.strictEqual(actual2.defaultValue, "off");
    assert.strictEqual(actual2.globalValue, "on");
    assert.strictEqual(actual2.globalLocalValue, "on");
    assert.strictEqual(actual2.globalRemoteValue, void 0);
    assert.strictEqual(actual2.workspaceValue, "bounded");
    assert.ok(Object.keys(actual2).indexOf("workspaceFolderValue") !== -1);
    assert.strictEqual(actual2.workspaceFolderValue, void 0);
  });
  test("inspect with language overrides", function() {
    const firstRoot = URI.file("foo1");
    const secondRoot = URI.file("foo2");
    const folders = [];
    folders.push([firstRoot, toConfigurationModel({
      "editor.wordWrap": "bounded",
      "[typescript]": {
        "editor.wordWrap": "unbounded"
      }
    })]);
    folders.push([secondRoot, toConfigurationModel({})]);
    const extHostWorkspace = createExtHostWorkspace();
    extHostWorkspace.$initializeWorkspace({
      "id": "foo",
      "folders": [aWorkspaceFolder(firstRoot, 0), aWorkspaceFolder(secondRoot, 1)],
      "name": "foo"
    }, true);
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      extHostWorkspace,
      {
        defaults: toConfigurationModel({
          "editor.wordWrap": "off",
          "[markdown]": {
            "editor.wordWrap": "bounded"
          }
        }),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: ConfigurationModel.createEmptyModel(new NullLogService()),
        userLocal: toConfigurationModel({
          "editor.wordWrap": "bounded",
          "[typescript]": {
            "editor.lineNumbers": "off"
          }
        }),
        userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
        workspace: toConfigurationModel({
          "[typescript]": {
            "editor.wordWrap": "unbounded",
            "editor.lineNumbers": "off"
          }
        }),
        folders,
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual = testObject.getConfiguration(void 0, { uri: firstRoot, languageId: "typescript" }).inspect("editor.wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalValue, "bounded");
    assert.strictEqual(actual.globalLocalValue, "bounded");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, "bounded");
    assert.strictEqual(actual.defaultLanguageValue, void 0);
    assert.strictEqual(actual.globalLanguageValue, void 0);
    assert.strictEqual(actual.workspaceLanguageValue, "unbounded");
    assert.strictEqual(actual.workspaceFolderLanguageValue, "unbounded");
    assert.deepStrictEqual(actual.languageIds, ["markdown", "typescript"]);
    actual = testObject.getConfiguration(void 0, { uri: secondRoot, languageId: "typescript" }).inspect("editor.wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalValue, "bounded");
    assert.strictEqual(actual.globalLocalValue, "bounded");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(actual.defaultLanguageValue, void 0);
    assert.strictEqual(actual.globalLanguageValue, void 0);
    assert.strictEqual(actual.workspaceLanguageValue, "unbounded");
    assert.strictEqual(actual.workspaceFolderLanguageValue, void 0);
    assert.deepStrictEqual(actual.languageIds, ["markdown", "typescript"]);
  });
  test("application is not set in inspect", () => {
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      createExtHostWorkspace(),
      {
        defaults: new ConfigurationModel({
          "editor": {
            "wordWrap": "off",
            "lineNumbers": "on",
            "fontSize": "12px"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        policy: ConfigurationModel.createEmptyModel(new NullLogService()),
        application: new ConfigurationModel({
          "editor": {
            "wordWrap": "on"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        userLocal: new ConfigurationModel({
          "editor": {
            "wordWrap": "auto",
            "lineNumbers": "off"
          }
        }, ["editor.wordWrap"], [], void 0, new NullLogService()),
        userRemote: ConfigurationModel.createEmptyModel(new NullLogService()),
        workspace: new ConfigurationModel({}, [], [], void 0, new NullLogService()),
        folders: [],
        configurationScopes: []
      },
      new NullLogService()
    );
    let actual = testObject.getConfiguration().inspect("editor.wordWrap");
    assert.strictEqual(actual.defaultValue, "off");
    assert.strictEqual(actual.globalValue, "auto");
    assert.strictEqual(actual.globalLocalValue, "auto");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(testObject.getConfiguration().get("editor.wordWrap"), "auto");
    actual = testObject.getConfiguration().inspect("editor.lineNumbers");
    assert.strictEqual(actual.defaultValue, "on");
    assert.strictEqual(actual.globalValue, "off");
    assert.strictEqual(actual.globalLocalValue, "off");
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(testObject.getConfiguration().get("editor.lineNumbers"), "off");
    actual = testObject.getConfiguration().inspect("editor.fontSize");
    assert.strictEqual(actual.defaultValue, "12px");
    assert.strictEqual(actual.globalLocalValue, void 0);
    assert.strictEqual(actual.globalRemoteValue, void 0);
    assert.strictEqual(actual.globalValue, void 0);
    assert.strictEqual(actual.workspaceValue, void 0);
    assert.strictEqual(actual.workspaceFolderValue, void 0);
    assert.strictEqual(testObject.getConfiguration().get("editor.fontSize"), "12px");
  });
  test("getConfiguration vs get", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "config0": true,
        "config4": 38
      }
    });
    let config = all.getConfiguration("farboo.config0");
    assert.strictEqual(config.get(""), void 0);
    assert.strictEqual(config.has(""), false);
    config = all.getConfiguration("farboo");
    assert.strictEqual(config.get("config0"), true);
    assert.strictEqual(config.has("config0"), true);
  });
  test("name vs property", function() {
    const all = createExtHostConfiguration({
      "farboo": {
        "get": "get-prop"
      }
    });
    const config = all.getConfiguration("farboo");
    assert.ok(config.has("get"));
    assert.strictEqual(config.get("get"), "get-prop");
    assert.deepStrictEqual(config["get"], config.get);
    assert.throws(() => config["get"] = "get-prop");
  });
  test("update: no target passes null", function() {
    const shape = new RecordingShape();
    const allConfig = createExtHostConfiguration({
      "foo": {
        "bar": 1,
        "far": 1
      }
    }, shape);
    const config = allConfig.getConfiguration("foo");
    config.update("bar", 42);
    assert.strictEqual(shape.lastArgs[0], null);
  });
  test("update/section to key", function() {
    const shape = new RecordingShape();
    const allConfig = createExtHostConfiguration({
      "foo": {
        "bar": 1,
        "far": 1
      }
    }, shape);
    let config = allConfig.getConfiguration("foo");
    config.update("bar", 42, true);
    assert.strictEqual(shape.lastArgs[0], ConfigurationTarget.USER);
    assert.strictEqual(shape.lastArgs[1], "foo.bar");
    assert.strictEqual(shape.lastArgs[2], 42);
    config = allConfig.getConfiguration("");
    config.update("bar", 42, true);
    assert.strictEqual(shape.lastArgs[1], "bar");
    config.update("foo.bar", 42, true);
    assert.strictEqual(shape.lastArgs[1], "foo.bar");
  });
  test("update, what is #15834", function() {
    const shape = new RecordingShape();
    const allConfig = createExtHostConfiguration({
      "editor": {
        "formatOnSave": true
      }
    }, shape);
    allConfig.getConfiguration("editor").update("formatOnSave", { extensions: ["ts"] });
    assert.strictEqual(shape.lastArgs[1], "editor.formatOnSave");
    assert.deepStrictEqual(shape.lastArgs[2], { extensions: ["ts"] });
  });
  test("update/error-state not OK", function() {
    const shape = new class extends mock() {
      $updateConfigurationOption(target, key, value) {
        return Promise.reject(new Error("Unknown Key"));
      }
    }();
    return createExtHostConfiguration({}, shape).getConfiguration("").update("", true, false).then(() => assert.ok(false), (err) => {
    });
  });
  test("configuration change event", (done) => {
    const workspaceFolder = aWorkspaceFolder(URI.file("folder1"), 0);
    const extHostWorkspace = createExtHostWorkspace();
    extHostWorkspace.$initializeWorkspace({
      "id": "foo",
      "folders": [workspaceFolder],
      "name": "foo"
    }, true);
    const testObject = new ExtHostConfigProvider(
      new class extends mock() {
      }(),
      extHostWorkspace,
      createConfigurationData({
        "farboo": {
          "config": false,
          "updatedConfig": false
        }
      }),
      new NullLogService()
    );
    const newConfigData = createConfigurationData({
      "farboo": {
        "config": false,
        "updatedConfig": true,
        "newConfig": true
      }
    });
    const configEventData = { keys: ["farboo.updatedConfig", "farboo.newConfig"], overrides: [] };
    store.add(testObject.onDidChangeConfiguration((e) => {
      assert.deepStrictEqual(testObject.getConfiguration().get("farboo"), {
        "config": false,
        "updatedConfig": true,
        "newConfig": true
      });
      assert.ok(e.affectsConfiguration("farboo"));
      assert.ok(e.affectsConfiguration("farboo", workspaceFolder.uri));
      assert.ok(e.affectsConfiguration("farboo", URI.file("any")));
      assert.ok(e.affectsConfiguration("farboo.updatedConfig"));
      assert.ok(e.affectsConfiguration("farboo.updatedConfig", workspaceFolder.uri));
      assert.ok(e.affectsConfiguration("farboo.updatedConfig", URI.file("any")));
      assert.ok(e.affectsConfiguration("farboo.newConfig"));
      assert.ok(e.affectsConfiguration("farboo.newConfig", workspaceFolder.uri));
      assert.ok(e.affectsConfiguration("farboo.newConfig", URI.file("any")));
      assert.ok(!e.affectsConfiguration("farboo.config"));
      assert.ok(!e.affectsConfiguration("farboo.config", workspaceFolder.uri));
      assert.ok(!e.affectsConfiguration("farboo.config", URI.file("any")));
      done();
    }));
    testObject.$acceptConfigurationChanged(newConfigData, configEventData);
  });
  test("get return instance of array value", function() {
    const testObject = createExtHostConfiguration({ "far": { "boo": [] } });
    const value = testObject.getConfiguration().get("far.boo", []);
    value.push("a");
    const actual = testObject.getConfiguration().get("far.boo", []);
    assert.deepStrictEqual(actual, []);
  });
  function aWorkspaceFolder(uri, index, name = "") {
    return new WorkspaceFolder({ uri, name, index });
  }
  function toConfigurationModel(obj) {
    const parser = new ConfigurationModelParser("test", new NullLogService());
    parser.parse(JSON.stringify(obj));
    return parser.configurationModel;
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RDb25maWd1cmF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0SG9zdFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25JbnNwZWN0LCBFeHRIb3N0Q29uZmlnUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZENvbmZpZ3VyYXRpb25TaGFwZSwgSUNvbmZpZ3VyYXRpb25Jbml0RGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25Nb2RlbCwgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbk1vZGVscy5qcyc7XG5pbXBvcnQgeyBUZXN0UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlciwgV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25Nb2RlbCwgSUNvbmZpZ3VyYXRpb25DaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RGaWxlU3lzdGVtSW5mby5qcyc7XG5pbXBvcnQgeyBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElVUklUcmFuc2Zvcm1lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFVyaVRyYW5zZm9ybWVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0V4dEhvc3RDb25maWd1cmF0aW9uJywgZnVuY3Rpb24gKCkge1xuXG5cdGNsYXNzIFJlY29yZGluZ1NoYXBlIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlPigpIHtcblx0XHRsYXN0QXJncyE6IFtDb25maWd1cmF0aW9uVGFyZ2V0LCBzdHJpbmcsIGFueV07XG5cdFx0b3ZlcnJpZGUgJHVwZGF0ZUNvbmZpZ3VyYXRpb25PcHRpb24odGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCBrZXk6IHN0cmluZywgdmFsdWU6IGFueSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0dGhpcy5sYXN0QXJncyA9IFt0YXJnZXQsIGtleSwgdmFsdWVdO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UoKTogRXh0SG9zdFdvcmtzcGFjZSB7XG5cdFx0cmV0dXJuIG5ldyBFeHRIb3N0V29ya3NwYWNlKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdEluaXREYXRhU2VydmljZT4oKSB7IH0sIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RGaWxlU3lzdGVtSW5mbz4oKSB7IG92ZXJyaWRlIGdldENhcGFiaWxpdGllcygpIHsgcmV0dXJuIGlzTGludXggPyBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuUGF0aENhc2VTZW5zaXRpdmUgOiB1bmRlZmluZWQ7IH0gfSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVSSVRyYW5zZm9ybWVyU2VydmljZT4oKSB7IH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlRXh0SG9zdENvbmZpZ3VyYXRpb24oY29udGVudHM6IGFueSA9IE9iamVjdC5jcmVhdGUobnVsbCksIHNoYXBlPzogTWFpblRocmVhZENvbmZpZ3VyYXRpb25TaGFwZSkge1xuXHRcdGlmICghc2hhcGUpIHtcblx0XHRcdHNoYXBlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlPigpIHsgfTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBFeHRIb3N0Q29uZmlnUHJvdmlkZXIoc2hhcGUsIGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UoKSwgY3JlYXRlQ29uZmlndXJhdGlvbkRhdGEoY29udGVudHMpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDb25maWd1cmF0aW9uRGF0YShjb250ZW50czogYW55KTogSUNvbmZpZ3VyYXRpb25Jbml0RGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlZmF1bHRzOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKGNvbnRlbnRzLCBbXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0cG9saWN5OiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRhcHBsaWNhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0dXNlckxvY2FsOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKGNvbnRlbnRzLCBbXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0dXNlclJlbW90ZTogQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0d29ya3NwYWNlOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRmb2xkZXJzOiBbXSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TY29wZXM6IFtdXG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZ2V0Q29uZmlndXJhdGlvbiBmYWlscyByZWdyZXNzaW9uIHRlc3QgMS43LjEgLT4gMS44ICMxNTU1MicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHRIb3N0Q29uZmlnID0gY3JlYXRlRXh0SG9zdENvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J3NlYXJjaCc6IHtcblx0XHRcdFx0J2V4Y2x1ZGUnOiB7XG5cdFx0XHRcdFx0JyoqL25vZGVfbW9kdWxlcyc6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RDb25maWcuZ2V0Q29uZmlndXJhdGlvbignc2VhcmNoLmV4Y2x1ZGUnKVsnKiovbm9kZV9tb2R1bGVzJ10sIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRIb3N0Q29uZmlnLmdldENvbmZpZ3VyYXRpb24oJ3NlYXJjaC5leGNsdWRlJykuZ2V0KCcqKi9ub2RlX21vZHVsZXMnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RDb25maWcuZ2V0Q29uZmlndXJhdGlvbignc2VhcmNoJykuZ2V0PGFueT4oJ2V4Y2x1ZGUnKVsnKiovbm9kZV9tb2R1bGVzJ10sIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3RDb25maWcuZ2V0Q29uZmlndXJhdGlvbignc2VhcmNoLmV4Y2x1ZGUnKS5oYXMoJyoqL25vZGVfbW9kdWxlcycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0SG9zdENvbmZpZy5nZXRDb25maWd1cmF0aW9uKCdzZWFyY2gnKS5oYXMoJ2V4Y2x1ZGUuKiovbm9kZV9tb2R1bGVzJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYXMvZ2V0JywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWxsID0gY3JlYXRlRXh0SG9zdENvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2ZhcmJvbyc6IHtcblx0XHRcdFx0J2NvbmZpZzAnOiB0cnVlLFxuXHRcdFx0XHQnbmVzdGVkJzoge1xuXHRcdFx0XHRcdCdjb25maWcxJzogNDIsXG5cdFx0XHRcdFx0J2NvbmZpZzInOiAnRGFzIFBmZXJkIGZyaXNzdCBrZWluIFJlaXMuJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQnY29uZmlnNCc6ICcnXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vJyk7XG5cblx0XHRhc3NlcnQub2soY29uZmlnLmhhcygnY29uZmlnMCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmdldCgnY29uZmlnMCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmdldCgnY29uZmlnNCcpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZ1snY29uZmlnMCddLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnWydjb25maWc0J10sICcnKTtcblxuXHRcdGFzc2VydC5vayhjb25maWcuaGFzKCduZXN0ZWQuY29uZmlnMScpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmdldCgnbmVzdGVkLmNvbmZpZzEnKSwgNDIpO1xuXHRcdGFzc2VydC5vayhjb25maWcuaGFzKCduZXN0ZWQuY29uZmlnMicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmdldCgnbmVzdGVkLmNvbmZpZzInKSwgJ0RhcyBQZmVyZCBmcmlzc3Qga2VpbiBSZWlzLicpO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbmZpZy5oYXMoJ25lc3RlZCcpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZy5nZXQoJ25lc3RlZCcpLCB7IGNvbmZpZzE6IDQyLCBjb25maWcyOiAnRGFzIFBmZXJkIGZyaXNzdCBrZWluIFJlaXMuJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0IG5lc3RlZCBjb25maWcnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBhbGwgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnZmFyYm9vJzoge1xuXHRcdFx0XHQnY29uZmlnMCc6IHRydWUsXG5cdFx0XHRcdCduZXN0ZWQnOiB7XG5cdFx0XHRcdFx0J2NvbmZpZzEnOiA0Mixcblx0XHRcdFx0XHQnY29uZmlnMic6ICdEYXMgUGZlcmQgZnJpc3N0IGtlaW4gUmVpcy4nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdjb25maWc0JzogJydcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvby5uZXN0ZWQnKS5nZXQoJ2NvbmZpZzEnKSwgNDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvby5uZXN0ZWQnKS5nZXQoJ2NvbmZpZzInKSwgJ0RhcyBQZmVyZCBmcmlzc3Qga2VpbiBSZWlzLicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvby5uZXN0ZWQnKVsnY29uZmlnMSddLCA0Mik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vLm5lc3RlZCcpWydjb25maWcyJ10sICdEYXMgUGZlcmQgZnJpc3N0IGtlaW4gUmVpcy4nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFsbC5nZXRDb25maWd1cmF0aW9uKCdmYXJib28ubmVzdGVkMScpLmdldCgnY29uZmlnMScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvby5uZXN0ZWQxJykuZ2V0KCdjb25maWcyJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhbGwuZ2V0Q29uZmlndXJhdGlvbignZmFyYm9vLmNvbmZpZzAuY29uZmlnMScpLmdldCgnYScpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvby5jb25maWcwLmNvbmZpZzEnKVsnYSddLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gbW9kaWZ5IHRoZSByZXR1cm5lZCBjb25maWd1cmF0aW9uJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgYWxsID0gY3JlYXRlRXh0SG9zdENvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2ZhcmJvbyc6IHtcblx0XHRcdFx0J2NvbmZpZzAnOiB0cnVlLFxuXHRcdFx0XHQnbmVzdGVkJzoge1xuXHRcdFx0XHRcdCdjb25maWcxJzogNDIsXG5cdFx0XHRcdFx0J2NvbmZpZzInOiAnRGFzIFBmZXJkIGZyaXNzdCBrZWluIFJlaXMuJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQnY29uZmlnNCc6ICcnXG5cdFx0XHR9LFxuXHRcdFx0J3dvcmtiZW5jaCc6IHtcblx0XHRcdFx0J2NvbG9yQ3VzdG9taXphdGlvbnMnOiB7XG5cdFx0XHRcdFx0J3N0YXR1c0Jhci5mb3JlZ3JvdW5kJzogJ3NvbWV2YWx1ZSdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IHRlc3RPYmplY3QgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbigpO1xuXHRcdGxldCBhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldDxhbnk+KCdmYXJib28nKSE7XG5cdFx0YWN0dWFsWyduZXN0ZWQnXVsnY29uZmlnMSddID0gNDE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDQxLCBhY3R1YWxbJ25lc3RlZCddWydjb25maWcxJ10pO1xuXHRcdGFjdHVhbFsnZmFyYm9vMSddID0gJ25ld1ZhbHVlJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ25ld1ZhbHVlJywgYWN0dWFsWydmYXJib28xJ10pO1xuXG5cdFx0dGVzdE9iamVjdCA9IGFsbC5nZXRDb25maWd1cmF0aW9uKCk7XG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXQoJ2ZhcmJvbycpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWyduZXN0ZWQnXVsnY29uZmlnMSddLCA0Mik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFsnZmFyYm9vMSddLCB1bmRlZmluZWQpO1xuXG5cdFx0dGVzdE9iamVjdCA9IGFsbC5nZXRDb25maWd1cmF0aW9uKCk7XG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXQoJ2ZhcmJvbycpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsWydjb25maWcwJ10sIHRydWUpO1xuXHRcdGFjdHVhbFsnY29uZmlnMCddID0gZmFsc2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFsnY29uZmlnMCddLCBmYWxzZSk7XG5cblx0XHR0ZXN0T2JqZWN0ID0gYWxsLmdldENvbmZpZ3VyYXRpb24oKTtcblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldCgnZmFyYm9vJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbJ2NvbmZpZzAnXSwgdHJ1ZSk7XG5cblx0XHR0ZXN0T2JqZWN0ID0gYWxsLmdldENvbmZpZ3VyYXRpb24oKTtcblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0Lmluc3BlY3QoJ2ZhcmJvbycpITtcblx0XHRhY3R1YWxbJ3ZhbHVlJ10gPSAnZWZmZWN0aXZlVmFsdWUnO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnZWZmZWN0aXZlVmFsdWUnLCBhY3R1YWxbJ3ZhbHVlJ10pO1xuXG5cdFx0dGVzdE9iamVjdCA9IGFsbC5nZXRDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnKTtcblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldCgnY29sb3JDdXN0b21pemF0aW9ucycpITtcblx0XHRhY3R1YWxbJ3N0YXR1c0Jhci5mb3JlZ3JvdW5kJ10gPSB1bmRlZmluZWQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFsnc3RhdHVzQmFyLmZvcmVncm91bmQnXSwgdW5kZWZpbmVkKTtcblx0XHR0ZXN0T2JqZWN0ID0gYWxsLmdldENvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaCcpO1xuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0KCdjb2xvckN1c3RvbWl6YXRpb25zJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxbJ3N0YXR1c0Jhci5mb3JlZ3JvdW5kJ10sICdzb21ldmFsdWUnKTtcblx0fSk7XG5cblx0dGVzdCgnU3RyaW5naWZ5IHJldHVybmVkIGNvbmZpZ3VyYXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBhbGwgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnZmFyYm9vJzoge1xuXHRcdFx0XHQnY29uZmlnMCc6IHRydWUsXG5cdFx0XHRcdCduZXN0ZWQnOiB7XG5cdFx0XHRcdFx0J2NvbmZpZzEnOiA0Mixcblx0XHRcdFx0XHQnY29uZmlnMic6ICdEYXMgUGZlcmQgZnJpc3N0IGtlaW4gUmVpcy4nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdjb25maWc0JzogJydcblx0XHRcdH0sXG5cdFx0XHQnd29ya2JlbmNoJzoge1xuXHRcdFx0XHQnY29sb3JDdXN0b21pemF0aW9ucyc6IHtcblx0XHRcdFx0XHQnc3RhdHVzQmFyLmZvcmVncm91bmQnOiAnc29tZXZhbHVlJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZW1wdHlvYmplY3RrZXknOiB7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbigpO1xuXHRcdGxldCBhY3R1YWw6IGFueSA9IHRlc3RPYmplY3QuZ2V0KCdmYXJib28nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdjb25maWcwJzogdHJ1ZSxcblx0XHRcdCduZXN0ZWQnOiB7XG5cdFx0XHRcdCdjb25maWcxJzogNDIsXG5cdFx0XHRcdCdjb25maWcyJzogJ0RhcyBQZmVyZCBmcmlzc3Qga2VpbiBSZWlzLidcblx0XHRcdH0sXG5cdFx0XHQnY29uZmlnNCc6ICcnXG5cdFx0fSksIEpTT04uc3RyaW5naWZ5KGFjdHVhbCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1bmRlZmluZWQsIEpTT04uc3RyaW5naWZ5KHRlc3RPYmplY3QuZ2V0KCd1bmtub3dua2V5JykpKTtcblxuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0KCdmYXJib28nKSE7XG5cdFx0YWN0dWFsWydjb25maWcwJ10gPSBmYWxzZTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdjb25maWcwJzogZmFsc2UsXG5cdFx0XHQnbmVzdGVkJzoge1xuXHRcdFx0XHQnY29uZmlnMSc6IDQyLFxuXHRcdFx0XHQnY29uZmlnMic6ICdEYXMgUGZlcmQgZnJpc3N0IGtlaW4gUmVpcy4nXG5cdFx0XHR9LFxuXHRcdFx0J2NvbmZpZzQnOiAnJ1xuXHRcdH0pLCBKU09OLnN0cmluZ2lmeShhY3R1YWwpKTtcblxuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0PGFueT4oJ3dvcmtiZW5jaCcpIVsnY29sb3JDdXN0b21pemF0aW9ucyddITtcblx0XHRhY3R1YWxbJ3N0YXR1c0Jhci5iYWNrZ3JvdW5kJ10gPSAnYW5vdGhlcnZhbHVlJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdzdGF0dXNCYXIuZm9yZWdyb3VuZCc6ICdzb21ldmFsdWUnLFxuXHRcdFx0J3N0YXR1c0Jhci5iYWNrZ3JvdW5kJzogJ2Fub3RoZXJ2YWx1ZSdcblx0XHR9KSwgSlNPTi5zdHJpbmdpZnkoYWN0dWFsKSk7XG5cblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldCgnd29ya2JlbmNoJyk7XG5cdFx0YWN0dWFsWyd1bmtub3dua2V5J10gPSAnc29tZXZhbHVlJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdjb2xvckN1c3RvbWl6YXRpb25zJzoge1xuXHRcdFx0XHQnc3RhdHVzQmFyLmZvcmVncm91bmQnOiAnc29tZXZhbHVlJ1xuXHRcdFx0fSxcblx0XHRcdCdlbXB0eW9iamVjdGtleSc6IHt9LFxuXHRcdFx0J3Vua25vd25rZXknOiAnc29tZXZhbHVlJ1xuXHRcdH0pLCBKU09OLnN0cmluZ2lmeShhY3R1YWwpKTtcblxuXHRcdGFjdHVhbCA9IGFsbC5nZXRDb25maWd1cmF0aW9uKCd3b3JrYmVuY2gnKS5nZXQoJ2VtcHR5b2JqZWN0a2V5Jyk7XG5cdFx0YWN0dWFsID0ge1xuXHRcdFx0Li4uKGFjdHVhbCB8fCB7fSksXG5cdFx0XHQnc3RhdHVzQmFyLmJhY2tncm91bmQnOiBgIzBmZmAsXG5cdFx0XHQnc3RhdHVzQmFyLmZvcmVncm91bmQnOiBgI2ZmMGAsXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdzdGF0dXNCYXIuYmFja2dyb3VuZCc6IGAjMGZmYCxcblx0XHRcdCdzdGF0dXNCYXIuZm9yZWdyb3VuZCc6IGAjZmYwYCxcblx0XHR9KSwgSlNPTi5zdHJpbmdpZnkoYWN0dWFsKSk7XG5cblx0XHRhY3R1YWwgPSBhbGwuZ2V0Q29uZmlndXJhdGlvbignd29ya2JlbmNoJykuZ2V0KCd1bmtub3dua2V5Jyk7XG5cdFx0YWN0dWFsID0ge1xuXHRcdFx0Li4uKGFjdHVhbCB8fCB7fSksXG5cdFx0XHQnc3RhdHVzQmFyLmJhY2tncm91bmQnOiBgIzBmZmAsXG5cdFx0XHQnc3RhdHVzQmFyLmZvcmVncm91bmQnOiBgI2ZmMGAsXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdzdGF0dXNCYXIuYmFja2dyb3VuZCc6IGAjMGZmYCxcblx0XHRcdCdzdGF0dXNCYXIuZm9yZWdyb3VuZCc6IGAjZmYwYCxcblx0XHR9KSwgSlNPTi5zdHJpbmdpZnkoYWN0dWFsKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nhbm5vdCBtb2RpZnkgcmV0dXJuZWQgY29uZmlndXJhdGlvbicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGFsbCA9IGNyZWF0ZUV4dEhvc3RDb25maWd1cmF0aW9uKHtcblx0XHRcdCdmYXJib28nOiB7XG5cdFx0XHRcdCdjb25maWcwJzogdHJ1ZSxcblx0XHRcdFx0J25lc3RlZCc6IHtcblx0XHRcdFx0XHQnY29uZmlnMSc6IDQyLFxuXHRcdFx0XHRcdCdjb25maWcyJzogJ0RhcyBQZmVyZCBmcmlzc3Qga2VpbiBSZWlzLidcblx0XHRcdFx0fSxcblx0XHRcdFx0J2NvbmZpZzQnOiAnJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdDogYW55ID0gYWxsLmdldENvbmZpZ3VyYXRpb24oKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0ZXN0T2JqZWN0WydnZXQnXSA9IG51bGw7XG5cdFx0XHRhc3NlcnQuZmFpbCgnVGhpcyBzaG91bGQgYmUgcmVhZG9ubHknKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRlc3RPYmplY3RbJ2ZhcmJvbyddWydjb25maWcwJ10gPSBmYWxzZTtcblx0XHRcdGFzc2VydC5mYWlsKCdUaGlzIHNob3VsZCBiZSByZWFkb25seScpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGVzdE9iamVjdFsnZmFyYm9vJ11bJ2ZhcmJvbzEnXSA9ICdoZWxsbyc7XG5cdFx0XHRhc3NlcnQuZmFpbCgnVGhpcyBzaG91bGQgYmUgcmVhZG9ubHknKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdpbnNwZWN0IGluIG5vIHdvcmtzcGFjZSBjb250ZXh0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlPigpIHsgfSxcblx0XHRcdGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UoKSxcblx0XHRcdHtcblx0XHRcdFx0ZGVmYXVsdHM6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdFx0XHQnd29yZFdyYXAnOiAnb2ZmJyxcblx0XHRcdFx0XHRcdCdsaW5lTnVtYmVycyc6ICdvbicsXG5cdFx0XHRcdFx0XHQnZm9udFNpemUnOiAnMTJweCdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0cG9saWN5OiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdGFwcGxpY2F0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHVzZXJMb2NhbDogbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0XHRcdCd3b3JkV3JhcCc6ICdvbicsXG5cdFx0XHRcdFx0XHQnbGluZU51bWJlcnMnOiAnb2ZmJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnLCAnZWRpdG9yLmxpbmVOdW1iZXJzJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlclJlbW90ZTogbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0XHRcdCdsaW5lTnVtYmVycyc6ICdyZWxhdGl2ZSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLmxpbmVOdW1iZXJzJ10sIFtdLCB7XG5cdFx0XHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0XHRcdCdsaW5lTnVtYmVycyc6ICdyZWxhdGl2ZScsXG5cdFx0XHRcdFx0XHQnZm9udFNpemUnOiAnMTRweCdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0d29ya3NwYWNlOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHt9LCBbXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHRmb2xkZXJzOiBbXSxcblx0XHRcdFx0Y29uZmlndXJhdGlvblNjb3BlczogW11cblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKVxuXHRcdCk7XG5cblx0XHRsZXQgYWN0dWFsOiBDb25maWd1cmF0aW9uSW5zcGVjdDxzdHJpbmc+ID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCkuaW5zcGVjdCgnZWRpdG9yLndvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbignZWRpdG9yJykuaW5zcGVjdCgnd29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InKS5pbnNwZWN0KCdsaW5lTnVtYmVycycpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmRlZmF1bHRWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMb2NhbFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxSZW1vdGVWYWx1ZSwgJ3JlbGF0aXZlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxWYWx1ZSwgJ3JlbGF0aXZlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbignZWRpdG9yJykuZ2V0KCdmb250U2l6ZScpLCAnMTJweCcpO1xuXG5cdFx0YWN0dWFsID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InKS5pbnNwZWN0KCdmb250U2l6ZScpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmRlZmF1bHRWYWx1ZSwgJzEycHgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbExvY2FsVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxSZW1vdGVWYWx1ZSwgJzE0cHgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zcGVjdCBpbiBzaW5nbGUgcm9vdCBjb250ZXh0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IFVSSS5maWxlKCdmb28nKTtcblx0XHRjb25zdCBmb2xkZXJzOiBbVXJpQ29tcG9uZW50cywgSUNvbmZpZ3VyYXRpb25Nb2RlbF1bXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0J3dvcmRXcmFwJzogJ2JvdW5kZWQnXG5cdFx0XHR9XG5cdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGZvbGRlcnMucHVzaChbd29ya3NwYWNlVXJpLCB3b3Jrc3BhY2VdKTtcblx0XHRjb25zdCBleHRIb3N0V29ya3NwYWNlID0gY3JlYXRlRXh0SG9zdFdvcmtzcGFjZSgpO1xuXHRcdGV4dEhvc3RXb3Jrc3BhY2UuJGluaXRpYWxpemVXb3Jrc3BhY2Uoe1xuXHRcdFx0J2lkJzogJ2ZvbycsXG5cdFx0XHQnZm9sZGVycyc6IFthV29ya3NwYWNlRm9sZGVyKFVSSS5maWxlKCdmb28nKSwgMCldLFxuXHRcdFx0J25hbWUnOiAnZm9vJ1xuXHRcdH0sIHRydWUpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBuZXcgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyKFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlPigpIHsgfSxcblx0XHRcdGV4dEhvc3RXb3Jrc3BhY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGRlZmF1bHRzOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J3dvcmRXcmFwJzogJ29mZidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0cG9saWN5OiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdGFwcGxpY2F0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHVzZXJMb2NhbDogbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0XHRcdCd3b3JkV3JhcCc6ICdvbidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlclJlbW90ZTogQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TY29wZXM6IFtdXG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKClcblx0XHQpO1xuXG5cdFx0bGV0IGFjdHVhbDE6IENvbmZpZ3VyYXRpb25JbnNwZWN0PHN0cmluZz4gPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5pbnNwZWN0KCdlZGl0b3Iud29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZVZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YWN0dWFsMSA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbignZWRpdG9yJykuaW5zcGVjdCgnd29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZVZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0bGV0IGFjdHVhbDI6IENvbmZpZ3VyYXRpb25JbnNwZWN0PHN0cmluZz4gPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCB3b3Jrc3BhY2VVcmkpLmluc3BlY3QoJ2VkaXRvci53b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlRm9sZGVyVmFsdWUsICdib3VuZGVkJyk7XG5cblx0XHRhY3R1YWwyID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InLCB3b3Jrc3BhY2VVcmkpLmluc3BlY3QoJ3dvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zcGVjdCBpbiBtdWx0aSByb290IGNvbnRleHQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHQnd29yZFdyYXAnOiAnYm91bmRlZCdcblx0XHRcdH1cblx0XHR9LCBbJ2VkaXRvci53b3JkV3JhcCddLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHRjb25zdCBmaXJzdFJvb3QgPSBVUkkuZmlsZSgnZm9vMScpO1xuXHRcdGNvbnN0IHNlY29uZFJvb3QgPSBVUkkuZmlsZSgnZm9vMicpO1xuXHRcdGNvbnN0IHRoaXJkUm9vdCA9IFVSSS5maWxlKCdmb28zJyk7XG5cdFx0Y29uc3QgZm9sZGVyczogW1VyaUNvbXBvbmVudHMsIElDb25maWd1cmF0aW9uTW9kZWxdW10gPSBbXTtcblx0XHRmb2xkZXJzLnB1c2goW2ZpcnN0Um9vdCwgbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHQnd29yZFdyYXAnOiAnb2ZmJyxcblx0XHRcdFx0J2xpbmVOdW1iZXJzJzogJ3JlbGF0aXZlJ1xuXHRcdFx0fVxuXHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKV0pO1xuXHRcdGZvbGRlcnMucHVzaChbc2Vjb25kUm9vdCwgbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHQnd29yZFdyYXAnOiAnb24nXG5cdFx0XHR9XG5cdFx0fSwgWydlZGl0b3Iud29yZFdyYXAnXSwgW10sIHVuZGVmaW5lZCwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpXSk7XG5cdFx0Zm9sZGVycy5wdXNoKFt0aGlyZFJvb3QsIG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe30sIFtdLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSldKTtcblxuXHRcdGNvbnN0IGV4dEhvc3RXb3Jrc3BhY2UgPSBjcmVhdGVFeHRIb3N0V29ya3NwYWNlKCk7XG5cdFx0ZXh0SG9zdFdvcmtzcGFjZS4kaW5pdGlhbGl6ZVdvcmtzcGFjZSh7XG5cdFx0XHQnaWQnOiAnZm9vJyxcblx0XHRcdCdmb2xkZXJzJzogW2FXb3Jrc3BhY2VGb2xkZXIoZmlyc3RSb290LCAwKSwgYVdvcmtzcGFjZUZvbGRlcihzZWNvbmRSb290LCAxKV0sXG5cdFx0XHQnbmFtZSc6ICdmb28nXG5cdFx0fSwgdHJ1ZSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IG5ldyBFeHRIb3N0Q29uZmlnUHJvdmlkZXIoXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb25maWd1cmF0aW9uU2hhcGU+KCkgeyB9LFxuXHRcdFx0ZXh0SG9zdFdvcmtzcGFjZSxcblx0XHRcdHtcblx0XHRcdFx0ZGVmYXVsdHM6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0XHRcdCdlZGl0b3InOiB7XG5cdFx0XHRcdFx0XHQnd29yZFdyYXAnOiAnb2ZmJyxcblx0XHRcdFx0XHRcdCdsaW5lTnVtYmVycyc6ICdvbidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0cG9saWN5OiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdGFwcGxpY2F0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHVzZXJMb2NhbDogbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0XHRcdCd3b3JkV3JhcCc6ICdvbidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlclJlbW90ZTogQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRcdGZvbGRlcnMsXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TY29wZXM6IFtdXG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKClcblx0XHQpO1xuXG5cdFx0bGV0IGFjdHVhbDE6IENvbmZpZ3VyYXRpb25JbnNwZWN0PHN0cmluZz4gPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5pbnNwZWN0KCdlZGl0b3Iud29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZVZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YWN0dWFsMSA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbignZWRpdG9yJykuaW5zcGVjdCgnd29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZVZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YWN0dWFsMSA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbignZWRpdG9yJykuaW5zcGVjdCgnbGluZU51bWJlcnMnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDEuZGVmYXVsdFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMS5nbG9iYWxMb2NhbFZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwxLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0bGV0IGFjdHVhbDI6IENvbmZpZ3VyYXRpb25JbnNwZWN0PHN0cmluZz4gPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCBmaXJzdFJvb3QpLmluc3BlY3QoJ2VkaXRvci53b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlRm9sZGVyVmFsdWUsICdvZmYnKTtcblxuXHRcdGFjdHVhbDIgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oJ2VkaXRvcicsIGZpcnN0Um9vdCkuaW5zcGVjdCgnd29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZGVmYXVsdFZhbHVlLCAnb2ZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbExvY2FsVmFsdWUsICdvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZVZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZUZvbGRlclZhbHVlLCAnb2ZmJyk7XG5cblx0XHRhY3R1YWwyID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InLCBmaXJzdFJvb3QpLmluc3BlY3QoJ2xpbmVOdW1iZXJzJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmRlZmF1bHRWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsTG9jYWxWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgJ3JlbGF0aXZlJyk7XG5cblx0XHRhY3R1YWwyID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKHVuZGVmaW5lZCwgc2Vjb25kUm9vdCkuaW5zcGVjdCgnZWRpdG9yLndvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgJ29uJyk7XG5cblx0XHRhY3R1YWwyID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InLCBzZWNvbmRSb290KS5pbnNwZWN0KCd3b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlRm9sZGVyVmFsdWUsICdvbicpO1xuXG5cdFx0YWN0dWFsMiA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbih1bmRlZmluZWQsIHRoaXJkUm9vdCkuaW5zcGVjdCgnZWRpdG9yLndvcmRXcmFwJykhO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLmdsb2JhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxMb2NhbFZhbHVlLCAnb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxSZW1vdGVWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VWYWx1ZSwgJ2JvdW5kZWQnKTtcblx0XHRhc3NlcnQub2soT2JqZWN0LmtleXMoYWN0dWFsMikuaW5kZXhPZignd29ya3NwYWNlRm9sZGVyVmFsdWUnKSAhPT0gLTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwyLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0YWN0dWFsMiA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbignZWRpdG9yJywgdGhpcmRSb290KS5pbnNwZWN0KCd3b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi5nbG9iYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbDIud29ya3NwYWNlVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKE9iamVjdC5rZXlzKGFjdHVhbDIpLmluZGV4T2YoJ3dvcmtzcGFjZUZvbGRlclZhbHVlJykgIT09IC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsMi53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zcGVjdCB3aXRoIGxhbmd1YWdlIG92ZXJyaWRlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBmaXJzdFJvb3QgPSBVUkkuZmlsZSgnZm9vMScpO1xuXHRcdGNvbnN0IHNlY29uZFJvb3QgPSBVUkkuZmlsZSgnZm9vMicpO1xuXHRcdGNvbnN0IGZvbGRlcnM6IFtVcmlDb21wb25lbnRzLCBJQ29uZmlndXJhdGlvbk1vZGVsXVtdID0gW107XG5cdFx0Zm9sZGVycy5wdXNoKFtmaXJzdFJvb3QsIHRvQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdCdlZGl0b3Iud29yZFdyYXAnOiAnYm91bmRlZCcsXG5cdFx0XHQnW3R5cGVzY3JpcHRdJzoge1xuXHRcdFx0XHQnZWRpdG9yLndvcmRXcmFwJzogJ3VuYm91bmRlZCcsXG5cdFx0XHR9XG5cdFx0fSldKTtcblx0XHRmb2xkZXJzLnB1c2goW3NlY29uZFJvb3QsIHRvQ29uZmlndXJhdGlvbk1vZGVsKHt9KV0pO1xuXG5cdFx0Y29uc3QgZXh0SG9zdFdvcmtzcGFjZSA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UoKTtcblx0XHRleHRIb3N0V29ya3NwYWNlLiRpbml0aWFsaXplV29ya3NwYWNlKHtcblx0XHRcdCdpZCc6ICdmb28nLFxuXHRcdFx0J2ZvbGRlcnMnOiBbYVdvcmtzcGFjZUZvbGRlcihmaXJzdFJvb3QsIDApLCBhV29ya3NwYWNlRm9sZGVyKHNlY29uZFJvb3QsIDEpXSxcblx0XHRcdCduYW1lJzogJ2Zvbydcblx0XHR9LCB0cnVlKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEV4dEhvc3RDb25maWdQcm92aWRlcihcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbmZpZ3VyYXRpb25TaGFwZT4oKSB7IH0sXG5cdFx0XHRleHRIb3N0V29ya3NwYWNlLFxuXHRcdFx0e1xuXHRcdFx0XHRkZWZhdWx0czogdG9Db25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0XHRcdCdlZGl0b3Iud29yZFdyYXAnOiAnb2ZmJyxcblx0XHRcdFx0XHQnW21hcmtkb3duXSc6IHtcblx0XHRcdFx0XHRcdCdlZGl0b3Iud29yZFdyYXAnOiAnYm91bmRlZCcsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0cG9saWN5OiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdGFwcGxpY2F0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHVzZXJMb2NhbDogdG9Db25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0XHRcdCdlZGl0b3Iud29yZFdyYXAnOiAnYm91bmRlZCcsXG5cdFx0XHRcdFx0J1t0eXBlc2NyaXB0XSc6IHtcblx0XHRcdFx0XHRcdCdlZGl0b3IubGluZU51bWJlcnMnOiAnb2ZmJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR1c2VyUmVtb3RlOiBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHdvcmtzcGFjZTogdG9Db25maWd1cmF0aW9uTW9kZWwoe1xuXHRcdFx0XHRcdCdbdHlwZXNjcmlwdF0nOiB7XG5cdFx0XHRcdFx0XHQnZWRpdG9yLndvcmRXcmFwJzogJ3VuYm91bmRlZCcsXG5cdFx0XHRcdFx0XHQnZWRpdG9yLmxpbmVOdW1iZXJzJzogJ29mZicsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Zm9sZGVycyxcblx0XHRcdFx0Y29uZmlndXJhdGlvblNjb3BlczogW11cblx0XHRcdH0sXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKVxuXHRcdCk7XG5cblx0XHRsZXQgYWN0dWFsOiBDb25maWd1cmF0aW9uSW5zcGVjdDxzdHJpbmc+ID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKHVuZGVmaW5lZCwgeyB1cmk6IGZpcnN0Um9vdCwgbGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnIH0pLmluc3BlY3QoJ2VkaXRvci53b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMb2NhbFZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZUZvbGRlclZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZGVmYXVsdExhbmd1YWdlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMYW5ndWFnZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlTGFuZ3VhZ2VWYWx1ZSwgJ3VuYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlRm9sZGVyTGFuZ3VhZ2VWYWx1ZSwgJ3VuYm91bmRlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmxhbmd1YWdlSWRzLCBbJ21hcmtkb3duJywgJ3R5cGVzY3JpcHQnXSk7XG5cblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCB7IHVyaTogc2Vjb25kUm9vdCwgbGFuZ3VhZ2VJZDogJ3R5cGVzY3JpcHQnIH0pLmluc3BlY3QoJ2VkaXRvci53b3JkV3JhcCcpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmRlZmF1bHRWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsVmFsdWUsICdib3VuZGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMb2NhbFZhbHVlLCAnYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZGVmYXVsdExhbmd1YWdlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMYW5ndWFnZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlTGFuZ3VhZ2VWYWx1ZSwgJ3VuYm91bmRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlRm9sZGVyTGFuZ3VhZ2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5sYW5ndWFnZUlkcywgWydtYXJrZG93bicsICd0eXBlc2NyaXB0J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBsaWNhdGlvbiBpcyBub3Qgc2V0IGluIGluc3BlY3QnLCAoKSA9PiB7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEV4dEhvc3RDb25maWdQcm92aWRlcihcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbmZpZ3VyYXRpb25TaGFwZT4oKSB7IH0sXG5cdFx0XHRjcmVhdGVFeHRIb3N0V29ya3NwYWNlKCksXG5cdFx0XHR7XG5cdFx0XHRcdGRlZmF1bHRzOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J3dvcmRXcmFwJzogJ29mZicsXG5cdFx0XHRcdFx0XHQnbGluZU51bWJlcnMnOiAnb24nLFxuXHRcdFx0XHRcdFx0J2ZvbnRTaXplJzogJzEycHgnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCBbJ2VkaXRvci53b3JkV3JhcCddLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdHBvbGljeTogQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHRhcHBsaWNhdGlvbjogbmV3IENvbmZpZ3VyYXRpb25Nb2RlbCh7XG5cdFx0XHRcdFx0J2VkaXRvcic6IHtcblx0XHRcdFx0XHRcdCd3b3JkV3JhcCc6ICdvbidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlckxvY2FsOiBuZXcgQ29uZmlndXJhdGlvbk1vZGVsKHtcblx0XHRcdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHRcdFx0J3dvcmRXcmFwJzogJ2F1dG8nLFxuXHRcdFx0XHRcdFx0J2xpbmVOdW1iZXJzJzogJ29mZidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFsnZWRpdG9yLndvcmRXcmFwJ10sIFtdLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdFx0dXNlclJlbW90ZTogQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0XHR3b3Jrc3BhY2U6IG5ldyBDb25maWd1cmF0aW9uTW9kZWwoe30sIFtdLCBbXSwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2NvcGVzOiBbXVxuXHRcdFx0fSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpXG5cdFx0KTtcblxuXHRcdGxldCBhY3R1YWw6IENvbmZpZ3VyYXRpb25JbnNwZWN0PHN0cmluZz4gPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5pbnNwZWN0KCdlZGl0b3Iud29yZFdyYXAnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5kZWZhdWx0VmFsdWUsICdvZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFZhbHVlLCAnYXV0bycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsTG9jYWxWYWx1ZSwgJ2F1dG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmdsb2JhbFJlbW90ZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCkuZ2V0KCdlZGl0b3Iud29yZFdyYXAnKSwgJ2F1dG8nKTtcblxuXHRcdGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmluc3BlY3QoJ2VkaXRvci5saW5lTnVtYmVycycpITtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmRlZmF1bHRWYWx1ZSwgJ29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsTG9jYWxWYWx1ZSwgJ29mZicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC53b3Jrc3BhY2VWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZUZvbGRlclZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5nZXQoJ2VkaXRvci5saW5lTnVtYmVycycpLCAnb2ZmJyk7XG5cblx0XHRhY3R1YWwgPSB0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5pbnNwZWN0KCdlZGl0b3IuZm9udFNpemUnKSE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5kZWZhdWx0VmFsdWUsICcxMnB4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxMb2NhbFZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuZ2xvYmFsUmVtb3RlVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5nbG9iYWxWYWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLndvcmtzcGFjZVZhbHVlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwud29ya3NwYWNlRm9sZGVyVmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmdldCgnZWRpdG9yLmZvbnRTaXplJyksICcxMnB4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENvbmZpZ3VyYXRpb24gdnMgZ2V0JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgYWxsID0gY3JlYXRlRXh0SG9zdENvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2ZhcmJvbyc6IHtcblx0XHRcdFx0J2NvbmZpZzAnOiB0cnVlLFxuXHRcdFx0XHQnY29uZmlnNCc6IDM4XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsZXQgY29uZmlnID0gYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvby5jb25maWcwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZy5nZXQoJycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuaGFzKCcnKSwgZmFsc2UpO1xuXG5cdFx0Y29uZmlnID0gYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuZ2V0KCdjb25maWcwJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcuaGFzKCdjb25maWcwJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCduYW1lIHZzIHByb3BlcnR5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGFsbCA9IGNyZWF0ZUV4dEhvc3RDb25maWd1cmF0aW9uKHtcblx0XHRcdCdmYXJib28nOiB7XG5cdFx0XHRcdCdnZXQnOiAnZ2V0LXByb3AnXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgY29uZmlnID0gYWxsLmdldENvbmZpZ3VyYXRpb24oJ2ZhcmJvbycpO1xuXG5cdFx0YXNzZXJ0Lm9rKGNvbmZpZy5oYXMoJ2dldCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLmdldCgnZ2V0JyksICdnZXQtcHJvcCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlnWydnZXQnXSwgY29uZmlnLmdldCk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBjb25maWdbJ2dldCddID0gPGFueT4nZ2V0LXByb3AnKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlOiBubyB0YXJnZXQgcGFzc2VzIG51bGwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2hhcGUgPSBuZXcgUmVjb3JkaW5nU2hhcGUoKTtcblx0XHRjb25zdCBhbGxDb25maWcgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnZm9vJzoge1xuXHRcdFx0XHQnYmFyJzogMSxcblx0XHRcdFx0J2Zhcic6IDFcblx0XHRcdH1cblx0XHR9LCBzaGFwZSk7XG5cblx0XHRjb25zdCBjb25maWcgPSBhbGxDb25maWcuZ2V0Q29uZmlndXJhdGlvbignZm9vJyk7XG5cdFx0Y29uZmlnLnVwZGF0ZSgnYmFyJywgNDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoYXBlLmxhc3RBcmdzWzBdLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlL3NlY3Rpb24gdG8ga2V5JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qgc2hhcGUgPSBuZXcgUmVjb3JkaW5nU2hhcGUoKTtcblx0XHRjb25zdCBhbGxDb25maWcgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnZm9vJzoge1xuXHRcdFx0XHQnYmFyJzogMSxcblx0XHRcdFx0J2Zhcic6IDFcblx0XHRcdH1cblx0XHR9LCBzaGFwZSk7XG5cblx0XHRsZXQgY29uZmlnID0gYWxsQ29uZmlnLmdldENvbmZpZ3VyYXRpb24oJ2ZvbycpO1xuXHRcdGNvbmZpZy51cGRhdGUoJ2JhcicsIDQyLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGFwZS5sYXN0QXJnc1swXSwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hhcGUubGFzdEFyZ3NbMV0sICdmb28uYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoYXBlLmxhc3RBcmdzWzJdLCA0Mik7XG5cblx0XHRjb25maWcgPSBhbGxDb25maWcuZ2V0Q29uZmlndXJhdGlvbignJyk7XG5cdFx0Y29uZmlnLnVwZGF0ZSgnYmFyJywgNDIsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGFwZS5sYXN0QXJnc1sxXSwgJ2JhcicpO1xuXG5cdFx0Y29uZmlnLnVwZGF0ZSgnZm9vLmJhcicsIDQyLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hhcGUubGFzdEFyZ3NbMV0sICdmb28uYmFyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZSwgd2hhdCBpcyAjMTU4MzQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc2hhcGUgPSBuZXcgUmVjb3JkaW5nU2hhcGUoKTtcblx0XHRjb25zdCBhbGxDb25maWcgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7XG5cdFx0XHQnZWRpdG9yJzoge1xuXHRcdFx0XHQnZm9ybWF0T25TYXZlJzogdHJ1ZVxuXHRcdFx0fVxuXHRcdH0sIHNoYXBlKTtcblxuXHRcdGFsbENvbmZpZy5nZXRDb25maWd1cmF0aW9uKCdlZGl0b3InKS51cGRhdGUoJ2Zvcm1hdE9uU2F2ZScsIHsgZXh0ZW5zaW9uczogWyd0cyddIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGFwZS5sYXN0QXJnc1sxXSwgJ2VkaXRvci5mb3JtYXRPblNhdmUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNoYXBlLmxhc3RBcmdzWzJdLCB7IGV4dGVuc2lvbnM6IFsndHMnXSB9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlL2Vycm9yLXN0YXRlIG5vdCBPSycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHNoYXBlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29uZmlndXJhdGlvblNoYXBlPigpIHtcblx0XHRcdG92ZXJyaWRlICR1cGRhdGVDb25maWd1cmF0aW9uT3B0aW9uKHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwga2V5OiBzdHJpbmcsIHZhbHVlOiBhbnkpOiBQcm9taXNlPGFueT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdVbmtub3duIEtleScpKTsgLy8gc29tZXRoaW5nICE9PSBPS1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZXR1cm4gY3JlYXRlRXh0SG9zdENvbmZpZ3VyYXRpb24oe30sIHNoYXBlKVxuXHRcdFx0LmdldENvbmZpZ3VyYXRpb24oJycpXG5cdFx0XHQudXBkYXRlKCcnLCB0cnVlLCBmYWxzZSlcblx0XHRcdC50aGVuKCgpID0+IGFzc2VydC5vayhmYWxzZSksIGVyciA9PiB7IC8qIGV4cGVjdGluZyByZWplY3Rpb24gKi8gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyYXRpb24gY2hhbmdlIGV2ZW50JywgKGRvbmUpID0+IHtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IGFXb3Jrc3BhY2VGb2xkZXIoVVJJLmZpbGUoJ2ZvbGRlcjEnKSwgMCk7XG5cdFx0Y29uc3QgZXh0SG9zdFdvcmtzcGFjZSA9IGNyZWF0ZUV4dEhvc3RXb3Jrc3BhY2UoKTtcblx0XHRleHRIb3N0V29ya3NwYWNlLiRpbml0aWFsaXplV29ya3NwYWNlKHtcblx0XHRcdCdpZCc6ICdmb28nLFxuXHRcdFx0J2ZvbGRlcnMnOiBbd29ya3NwYWNlRm9sZGVyXSxcblx0XHRcdCduYW1lJzogJ2Zvbydcblx0XHR9LCB0cnVlKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gbmV3IEV4dEhvc3RDb25maWdQcm92aWRlcihcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbmZpZ3VyYXRpb25TaGFwZT4oKSB7IH0sXG5cdFx0XHRleHRIb3N0V29ya3NwYWNlLFxuXHRcdFx0Y3JlYXRlQ29uZmlndXJhdGlvbkRhdGEoe1xuXHRcdFx0XHQnZmFyYm9vJzoge1xuXHRcdFx0XHRcdCdjb25maWcnOiBmYWxzZSxcblx0XHRcdFx0XHQndXBkYXRlZENvbmZpZyc6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKClcblx0XHQpO1xuXG5cdFx0Y29uc3QgbmV3Q29uZmlnRGF0YSA9IGNyZWF0ZUNvbmZpZ3VyYXRpb25EYXRhKHtcblx0XHRcdCdmYXJib28nOiB7XG5cdFx0XHRcdCdjb25maWcnOiBmYWxzZSxcblx0XHRcdFx0J3VwZGF0ZWRDb25maWcnOiB0cnVlLFxuXHRcdFx0XHQnbmV3Q29uZmlnJzogdHJ1ZSxcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBjb25maWdFdmVudERhdGE6IElDb25maWd1cmF0aW9uQ2hhbmdlID0geyBrZXlzOiBbJ2ZhcmJvby51cGRhdGVkQ29uZmlnJywgJ2ZhcmJvby5uZXdDb25maWcnXSwgb3ZlcnJpZGVzOiBbXSB9O1xuXHRcdHN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldENvbmZpZ3VyYXRpb24oKS5nZXQoJ2ZhcmJvbycpLCB7XG5cdFx0XHRcdCdjb25maWcnOiBmYWxzZSxcblx0XHRcdFx0J3VwZGF0ZWRDb25maWcnOiB0cnVlLFxuXHRcdFx0XHQnbmV3Q29uZmlnJzogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvbycsIHdvcmtzcGFjZUZvbGRlci51cmkpKTtcblx0XHRcdGFzc2VydC5vayhlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdmYXJib28nLCBVUkkuZmlsZSgnYW55JykpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvby51cGRhdGVkQ29uZmlnJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvby51cGRhdGVkQ29uZmlnJywgd29ya3NwYWNlRm9sZGVyLnVyaSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvby51cGRhdGVkQ29uZmlnJywgVVJJLmZpbGUoJ2FueScpKSk7XG5cblx0XHRcdGFzc2VydC5vayhlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdmYXJib28ubmV3Q29uZmlnJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvby5uZXdDb25maWcnLCB3b3Jrc3BhY2VGb2xkZXIudXJpKSk7XG5cdFx0XHRhc3NlcnQub2soZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZmFyYm9vLm5ld0NvbmZpZycsIFVSSS5maWxlKCdhbnknKSkpO1xuXG5cdFx0XHRhc3NlcnQub2soIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvby5jb25maWcnKSk7XG5cdFx0XHRhc3NlcnQub2soIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvby5jb25maWcnLCB3b3Jrc3BhY2VGb2xkZXIudXJpKSk7XG5cdFx0XHRhc3NlcnQub2soIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZhcmJvby5jb25maWcnLCBVUkkuZmlsZSgnYW55JykpKTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0T2JqZWN0LiRhY2NlcHRDb25maWd1cmF0aW9uQ2hhbmdlZChuZXdDb25maWdEYXRhLCBjb25maWdFdmVudERhdGEpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXQgcmV0dXJuIGluc3RhbmNlIG9mIGFycmF5IHZhbHVlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBjcmVhdGVFeHRIb3N0Q29uZmlndXJhdGlvbih7ICdmYXInOiB7ICdib28nOiBbXSB9IH0pO1xuXG5cdFx0Y29uc3QgdmFsdWU6IHN0cmluZ1tdID0gdGVzdE9iamVjdC5nZXRDb25maWd1cmF0aW9uKCkuZ2V0KCdmYXIuYm9vJywgW10pO1xuXHRcdHZhbHVlLnB1c2goJ2EnKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RPYmplY3QuZ2V0Q29uZmlndXJhdGlvbigpLmdldCgnZmFyLmJvbycsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW10pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBhV29ya3NwYWNlRm9sZGVyKHVyaTogVVJJLCBpbmRleDogbnVtYmVyLCBuYW1lOiBzdHJpbmcgPSAnJyk6IElXb3Jrc3BhY2VGb2xkZXIge1xuXHRcdHJldHVybiBuZXcgV29ya3NwYWNlRm9sZGVyKHsgdXJpLCBuYW1lLCBpbmRleCB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvQ29uZmlndXJhdGlvbk1vZGVsKG9iajogYW55KTogQ29uZmlndXJhdGlvbk1vZGVsIHtcblx0XHRjb25zdCBwYXJzZXIgPSBuZXcgQ29uZmlndXJhdGlvbk1vZGVsUGFyc2VyKCd0ZXN0JywgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdHBhcnNlci5wYXJzZShKU09OLnN0cmluZ2lmeShvYmopKTtcblx0XHRyZXR1cm4gcGFyc2VyLmNvbmZpZ3VyYXRpb25Nb2RlbDtcblx0fVxuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQStCLDZCQUE2QjtBQUU1RCxTQUFTLG9CQUFvQixnQ0FBZ0M7QUFDN0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQTJCLHVCQUF1QjtBQUNsRCxTQUFTLDJCQUFzRTtBQUMvRSxTQUFTLHNCQUFzQjtBQUcvQixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGVBQWU7QUFFeEIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSx3QkFBd0IsV0FBWTtBQUFBLEVBRXpDLE1BQU0sdUJBQXVCLEtBQW1DLEVBQUU7QUFBQSxJQUV4RCwyQkFBMkIsUUFBNkIsS0FBYSxPQUEyQjtBQUN4RyxXQUFLLFdBQVcsQ0FBQyxRQUFRLEtBQUssS0FBSztBQUNuQyxhQUFPLFFBQVEsUUFBUSxNQUFTO0FBQUEsSUFDakM7QUFBQSxFQUNEO0FBRUEsV0FBUyx5QkFBMkM7QUFDbkQsV0FBTyxJQUFJLGlCQUFpQixJQUFJLGdCQUFnQixHQUFHLElBQUksY0FBYyxLQUE4QixFQUFFO0FBQUEsSUFBRSxLQUFHLElBQUksY0FBYyxLQUE2QixFQUFFO0FBQUEsTUFBVyxrQkFBa0I7QUFBRSxlQUFPLFVBQVUsK0JBQStCLG9CQUFvQjtBQUFBLE1BQVc7QUFBQSxJQUFFLEtBQUcsSUFBSSxlQUFlLEdBQUcsSUFBSSxjQUFjLEtBQTZCLEVBQUU7QUFBQSxJQUFFLEdBQUM7QUFBQSxFQUN6VjtBQUVBLFdBQVMsMkJBQTJCLFdBQWdCLHVCQUFPLE9BQU8sSUFBSSxHQUFHLE9BQXNDO0FBQzlHLFFBQUksQ0FBQyxPQUFPO0FBQ1gsY0FBUSxJQUFJLGNBQWMsS0FBbUMsRUFBRTtBQUFBLE1BQUU7QUFBQSxJQUNsRTtBQUNBLFdBQU8sSUFBSSxzQkFBc0IsT0FBTyx1QkFBdUIsR0FBRyx3QkFBd0IsUUFBUSxHQUFHLElBQUksZUFBZSxDQUFDO0FBQUEsRUFDMUg7QUFFQSxXQUFTLHdCQUF3QixVQUF1QztBQUN2RSxXQUFPO0FBQUEsTUFDTixVQUFVLElBQUksbUJBQW1CLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxRQUFXLElBQUksZUFBZSxDQUFDO0FBQUEsTUFDbEYsUUFBUSxtQkFBbUIsaUJBQWlCLElBQUksZUFBZSxDQUFDO0FBQUEsTUFDaEUsYUFBYSxtQkFBbUIsaUJBQWlCLElBQUksZUFBZSxDQUFDO0FBQUEsTUFDckUsV0FBVyxJQUFJLG1CQUFtQixVQUFVLENBQUMsR0FBRyxDQUFDLEdBQUcsUUFBVyxJQUFJLGVBQWUsQ0FBQztBQUFBLE1BQ25GLFlBQVksbUJBQW1CLGlCQUFpQixJQUFJLGVBQWUsQ0FBQztBQUFBLE1BQ3BFLFdBQVcsbUJBQW1CLGlCQUFpQixJQUFJLGVBQWUsQ0FBQztBQUFBLE1BQ25FLFNBQVMsQ0FBQztBQUFBLE1BQ1YscUJBQXFCLENBQUM7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFFQSxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssOERBQThELFdBQVk7QUFDOUUsVUFBTSxnQkFBZ0IsMkJBQTJCO0FBQUEsTUFDaEQsVUFBVTtBQUFBLFFBQ1QsV0FBVztBQUFBLFVBQ1YsbUJBQW1CO0FBQUEsUUFDcEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxZQUFZLGNBQWMsaUJBQWlCLGdCQUFnQixFQUFFLGlCQUFpQixHQUFHLElBQUk7QUFDNUYsV0FBTyxZQUFZLGNBQWMsaUJBQWlCLGdCQUFnQixFQUFFLElBQUksaUJBQWlCLEdBQUcsSUFBSTtBQUNoRyxXQUFPLFlBQVksY0FBYyxpQkFBaUIsUUFBUSxFQUFFLElBQVMsU0FBUyxFQUFFLGlCQUFpQixHQUFHLElBQUk7QUFFeEcsV0FBTyxZQUFZLGNBQWMsaUJBQWlCLGdCQUFnQixFQUFFLElBQUksaUJBQWlCLEdBQUcsSUFBSTtBQUNoRyxXQUFPLFlBQVksY0FBYyxpQkFBaUIsUUFBUSxFQUFFLElBQUkseUJBQXlCLEdBQUcsSUFBSTtBQUFBLEVBQ2pHLENBQUM7QUFFRCxPQUFLLFdBQVcsTUFBTTtBQUVyQixVQUFNLE1BQU0sMkJBQTJCO0FBQUEsTUFDdEMsVUFBVTtBQUFBLFFBQ1QsV0FBVztBQUFBLFFBQ1gsVUFBVTtBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFFBQ1o7QUFBQSxRQUNBLFdBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxTQUFTLElBQUksaUJBQWlCLFFBQVE7QUFFNUMsV0FBTyxHQUFHLE9BQU8sSUFBSSxTQUFTLENBQUM7QUFDL0IsV0FBTyxZQUFZLE9BQU8sSUFBSSxTQUFTLEdBQUcsSUFBSTtBQUM5QyxXQUFPLFlBQVksT0FBTyxJQUFJLFNBQVMsR0FBRyxFQUFFO0FBQzVDLFdBQU8sWUFBWSxPQUFPLFNBQVMsR0FBRyxJQUFJO0FBQzFDLFdBQU8sWUFBWSxPQUFPLFNBQVMsR0FBRyxFQUFFO0FBRXhDLFdBQU8sR0FBRyxPQUFPLElBQUksZ0JBQWdCLENBQUM7QUFDdEMsV0FBTyxZQUFZLE9BQU8sSUFBSSxnQkFBZ0IsR0FBRyxFQUFFO0FBQ25ELFdBQU8sR0FBRyxPQUFPLElBQUksZ0JBQWdCLENBQUM7QUFDdEMsV0FBTyxZQUFZLE9BQU8sSUFBSSxnQkFBZ0IsR0FBRyw2QkFBNkI7QUFFOUUsV0FBTyxHQUFHLE9BQU8sSUFBSSxRQUFRLENBQUM7QUFDOUIsV0FBTyxnQkFBZ0IsT0FBTyxJQUFJLFFBQVEsR0FBRyxFQUFFLFNBQVMsSUFBSSxTQUFTLDhCQUE4QixDQUFDO0FBQUEsRUFDckcsQ0FBQztBQUVELE9BQUsscUJBQXFCLE1BQU07QUFFL0IsVUFBTSxNQUFNLDJCQUEyQjtBQUFBLE1BQ3RDLFVBQVU7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxRQUNaO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDWjtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLElBQUksaUJBQWlCLGVBQWUsRUFBRSxJQUFJLFNBQVMsR0FBRyxFQUFFO0FBQy9FLFdBQU8sZ0JBQWdCLElBQUksaUJBQWlCLGVBQWUsRUFBRSxJQUFJLFNBQVMsR0FBRyw2QkFBNkI7QUFDMUcsV0FBTyxnQkFBZ0IsSUFBSSxpQkFBaUIsZUFBZSxFQUFFLFNBQVMsR0FBRyxFQUFFO0FBQzNFLFdBQU8sZ0JBQWdCLElBQUksaUJBQWlCLGVBQWUsRUFBRSxTQUFTLEdBQUcsNkJBQTZCO0FBQ3RHLFdBQU8sZ0JBQWdCLElBQUksaUJBQWlCLGdCQUFnQixFQUFFLElBQUksU0FBUyxHQUFHLE1BQVM7QUFDdkYsV0FBTyxnQkFBZ0IsSUFBSSxpQkFBaUIsZ0JBQWdCLEVBQUUsSUFBSSxTQUFTLEdBQUcsTUFBUztBQUN2RixXQUFPLGdCQUFnQixJQUFJLGlCQUFpQix3QkFBd0IsRUFBRSxJQUFJLEdBQUcsR0FBRyxNQUFTO0FBQ3pGLFdBQU8sZ0JBQWdCLElBQUksaUJBQWlCLHdCQUF3QixFQUFFLEdBQUcsR0FBRyxNQUFTO0FBQUEsRUFDdEYsQ0FBQztBQUVELE9BQUsseUNBQXlDLFdBQVk7QUFFekQsVUFBTSxNQUFNLDJCQUEyQjtBQUFBLE1BQ3RDLFVBQVU7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLFVBQVU7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxRQUNaO0FBQUEsUUFDQSxXQUFXO0FBQUEsTUFDWjtBQUFBLE1BQ0EsYUFBYTtBQUFBLFFBQ1osdUJBQXVCO0FBQUEsVUFDdEIsd0JBQXdCO0FBQUEsUUFDekI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxhQUFhLElBQUksaUJBQWlCO0FBQ3RDLFFBQUksU0FBUyxXQUFXLElBQVMsUUFBUTtBQUN6QyxXQUFPLFFBQVEsRUFBRSxTQUFTLElBQUk7QUFDOUIsV0FBTyxZQUFZLElBQUksT0FBTyxRQUFRLEVBQUUsU0FBUyxDQUFDO0FBQ2xELFdBQU8sU0FBUyxJQUFJO0FBQ3BCLFdBQU8sWUFBWSxZQUFZLE9BQU8sU0FBUyxDQUFDO0FBRWhELGlCQUFhLElBQUksaUJBQWlCO0FBQ2xDLGFBQVMsV0FBVyxJQUFJLFFBQVE7QUFDaEMsV0FBTyxZQUFZLE9BQU8sUUFBUSxFQUFFLFNBQVMsR0FBRyxFQUFFO0FBQ2xELFdBQU8sWUFBWSxPQUFPLFNBQVMsR0FBRyxNQUFTO0FBRS9DLGlCQUFhLElBQUksaUJBQWlCO0FBQ2xDLGFBQVMsV0FBVyxJQUFJLFFBQVE7QUFDaEMsV0FBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLElBQUk7QUFDMUMsV0FBTyxTQUFTLElBQUk7QUFDcEIsV0FBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLEtBQUs7QUFFM0MsaUJBQWEsSUFBSSxpQkFBaUI7QUFDbEMsYUFBUyxXQUFXLElBQUksUUFBUTtBQUNoQyxXQUFPLFlBQVksT0FBTyxTQUFTLEdBQUcsSUFBSTtBQUUxQyxpQkFBYSxJQUFJLGlCQUFpQjtBQUNsQyxhQUFTLFdBQVcsUUFBUSxRQUFRO0FBQ3BDLFdBQU8sT0FBTyxJQUFJO0FBQ2xCLFdBQU8sWUFBWSxrQkFBa0IsT0FBTyxPQUFPLENBQUM7QUFFcEQsaUJBQWEsSUFBSSxpQkFBaUIsV0FBVztBQUM3QyxhQUFTLFdBQVcsSUFBSSxxQkFBcUI7QUFDN0MsV0FBTyxzQkFBc0IsSUFBSTtBQUNqQyxXQUFPLFlBQVksT0FBTyxzQkFBc0IsR0FBRyxNQUFTO0FBQzVELGlCQUFhLElBQUksaUJBQWlCLFdBQVc7QUFDN0MsYUFBUyxXQUFXLElBQUkscUJBQXFCO0FBQzdDLFdBQU8sWUFBWSxPQUFPLHNCQUFzQixHQUFHLFdBQVc7QUFBQSxFQUMvRCxDQUFDO0FBRUQsT0FBSyxvQ0FBb0MsV0FBWTtBQUVwRCxVQUFNLE1BQU0sMkJBQTJCO0FBQUEsTUFDdEMsVUFBVTtBQUFBLFFBQ1QsV0FBVztBQUFBLFFBQ1gsVUFBVTtBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFFBQ1o7QUFBQSxRQUNBLFdBQVc7QUFBQSxNQUNaO0FBQUEsTUFDQSxhQUFhO0FBQUEsUUFDWix1QkFBdUI7QUFBQSxVQUN0Qix3QkFBd0I7QUFBQSxRQUN6QjtBQUFBLFFBQ0Esa0JBQWtCLENBQ2xCO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sYUFBYSxJQUFJLGlCQUFpQjtBQUN4QyxRQUFJLFNBQWMsV0FBVyxJQUFJLFFBQVE7QUFDekMsV0FBTyxnQkFBZ0IsS0FBSyxVQUFVO0FBQUEsTUFDckMsV0FBVztBQUFBLE1BQ1gsVUFBVTtBQUFBLFFBQ1QsV0FBVztBQUFBLFFBQ1gsV0FBVztBQUFBLE1BQ1o7QUFBQSxNQUNBLFdBQVc7QUFBQSxJQUNaLENBQUMsR0FBRyxLQUFLLFVBQVUsTUFBTSxDQUFDO0FBRTFCLFdBQU8sZ0JBQWdCLFFBQVcsS0FBSyxVQUFVLFdBQVcsSUFBSSxZQUFZLENBQUMsQ0FBQztBQUU5RSxhQUFTLFdBQVcsSUFBSSxRQUFRO0FBQ2hDLFdBQU8sU0FBUyxJQUFJO0FBQ3BCLFdBQU8sZ0JBQWdCLEtBQUssVUFBVTtBQUFBLE1BQ3JDLFdBQVc7QUFBQSxNQUNYLFVBQVU7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxNQUNaO0FBQUEsTUFDQSxXQUFXO0FBQUEsSUFDWixDQUFDLEdBQUcsS0FBSyxVQUFVLE1BQU0sQ0FBQztBQUUxQixhQUFTLFdBQVcsSUFBUyxXQUFXLEVBQUcscUJBQXFCO0FBQ2hFLFdBQU8sc0JBQXNCLElBQUk7QUFDakMsV0FBTyxnQkFBZ0IsS0FBSyxVQUFVO0FBQUEsTUFDckMsd0JBQXdCO0FBQUEsTUFDeEIsd0JBQXdCO0FBQUEsSUFDekIsQ0FBQyxHQUFHLEtBQUssVUFBVSxNQUFNLENBQUM7QUFFMUIsYUFBUyxXQUFXLElBQUksV0FBVztBQUNuQyxXQUFPLFlBQVksSUFBSTtBQUN2QixXQUFPLGdCQUFnQixLQUFLLFVBQVU7QUFBQSxNQUNyQyx1QkFBdUI7QUFBQSxRQUN0Qix3QkFBd0I7QUFBQSxNQUN6QjtBQUFBLE1BQ0Esa0JBQWtCLENBQUM7QUFBQSxNQUNuQixjQUFjO0FBQUEsSUFDZixDQUFDLEdBQUcsS0FBSyxVQUFVLE1BQU0sQ0FBQztBQUUxQixhQUFTLElBQUksaUJBQWlCLFdBQVcsRUFBRSxJQUFJLGdCQUFnQjtBQUMvRCxhQUFTO0FBQUEsTUFDUixHQUFJLFVBQVUsQ0FBQztBQUFBLE1BQ2Ysd0JBQXdCO0FBQUEsTUFDeEIsd0JBQXdCO0FBQUEsSUFDekI7QUFDQSxXQUFPLGdCQUFnQixLQUFLLFVBQVU7QUFBQSxNQUNyQyx3QkFBd0I7QUFBQSxNQUN4Qix3QkFBd0I7QUFBQSxJQUN6QixDQUFDLEdBQUcsS0FBSyxVQUFVLE1BQU0sQ0FBQztBQUUxQixhQUFTLElBQUksaUJBQWlCLFdBQVcsRUFBRSxJQUFJLFlBQVk7QUFDM0QsYUFBUztBQUFBLE1BQ1IsR0FBSSxVQUFVLENBQUM7QUFBQSxNQUNmLHdCQUF3QjtBQUFBLE1BQ3hCLHdCQUF3QjtBQUFBLElBQ3pCO0FBQ0EsV0FBTyxnQkFBZ0IsS0FBSyxVQUFVO0FBQUEsTUFDckMsd0JBQXdCO0FBQUEsTUFDeEIsd0JBQXdCO0FBQUEsSUFDekIsQ0FBQyxHQUFHLEtBQUssVUFBVSxNQUFNLENBQUM7QUFBQSxFQUMzQixDQUFDO0FBRUQsT0FBSyx3Q0FBd0MsV0FBWTtBQUV4RCxVQUFNLE1BQU0sMkJBQTJCO0FBQUEsTUFDdEMsVUFBVTtBQUFBLFFBQ1QsV0FBVztBQUFBLFFBQ1gsVUFBVTtBQUFBLFVBQ1QsV0FBVztBQUFBLFVBQ1gsV0FBVztBQUFBLFFBQ1o7QUFBQSxRQUNBLFdBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDO0FBRUQsVUFBTSxhQUFrQixJQUFJLGlCQUFpQjtBQUU3QyxRQUFJO0FBQ0gsaUJBQVcsS0FBSyxJQUFJO0FBQ3BCLGFBQU8sS0FBSyx5QkFBeUI7QUFBQSxJQUN0QyxTQUFTLEdBQUc7QUFBQSxJQUNaO0FBRUEsUUFBSTtBQUNILGlCQUFXLFFBQVEsRUFBRSxTQUFTLElBQUk7QUFDbEMsYUFBTyxLQUFLLHlCQUF5QjtBQUFBLElBQ3RDLFNBQVMsR0FBRztBQUFBLElBQ1o7QUFFQSxRQUFJO0FBQ0gsaUJBQVcsUUFBUSxFQUFFLFNBQVMsSUFBSTtBQUNsQyxhQUFPLEtBQUsseUJBQXlCO0FBQUEsSUFDdEMsU0FBUyxHQUFHO0FBQUEsSUFDWjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssbUNBQW1DLFdBQVk7QUFDbkQsVUFBTSxhQUFhLElBQUk7QUFBQSxNQUN0QixJQUFJLGNBQWMsS0FBbUMsRUFBRTtBQUFBLE1BQUU7QUFBQSxNQUN6RCx1QkFBdUI7QUFBQSxNQUN2QjtBQUFBLFFBQ0MsVUFBVSxJQUFJLG1CQUFtQjtBQUFBLFVBQ2hDLFVBQVU7QUFBQSxZQUNULFlBQVk7QUFBQSxZQUNaLGVBQWU7QUFBQSxZQUNmLFlBQVk7QUFBQSxVQUNiO0FBQUEsUUFDRCxHQUFHLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLFFBQVcsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUMzRCxRQUFRLG1CQUFtQixpQkFBaUIsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUNoRSxhQUFhLG1CQUFtQixpQkFBaUIsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUNyRSxXQUFXLElBQUksbUJBQW1CO0FBQUEsVUFDakMsVUFBVTtBQUFBLFlBQ1QsWUFBWTtBQUFBLFlBQ1osZUFBZTtBQUFBLFVBQ2hCO0FBQUEsUUFDRCxHQUFHLENBQUMsbUJBQW1CLG9CQUFvQixHQUFHLENBQUMsR0FBRyxRQUFXLElBQUksZUFBZSxDQUFDO0FBQUEsUUFDakYsWUFBWSxJQUFJLG1CQUFtQjtBQUFBLFVBQ2xDLFVBQVU7QUFBQSxZQUNULGVBQWU7QUFBQSxVQUNoQjtBQUFBLFFBQ0QsR0FBRyxDQUFDLG9CQUFvQixHQUFHLENBQUMsR0FBRztBQUFBLFVBQzlCLFVBQVU7QUFBQSxZQUNULGVBQWU7QUFBQSxZQUNmLFlBQVk7QUFBQSxVQUNiO0FBQUEsUUFDRCxHQUFHLElBQUksZUFBZSxDQUFDO0FBQUEsUUFDdkIsV0FBVyxJQUFJLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxRQUFXLElBQUksZUFBZSxDQUFDO0FBQUEsUUFDN0UsU0FBUyxDQUFDO0FBQUEsUUFDVixxQkFBcUIsQ0FBQztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxJQUFJLGVBQWU7QUFBQSxJQUNwQjtBQUVBLFFBQUksU0FBdUMsV0FBVyxpQkFBaUIsRUFBRSxRQUFRLGlCQUFpQjtBQUNsRyxXQUFPLFlBQVksT0FBTyxjQUFjLEtBQUs7QUFDN0MsV0FBTyxZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFDaEQsV0FBTyxZQUFZLE9BQU8sbUJBQW1CLE1BQVM7QUFDdEQsV0FBTyxZQUFZLE9BQU8sYUFBYSxJQUFJO0FBQzNDLFdBQU8sWUFBWSxPQUFPLGdCQUFnQixNQUFTO0FBQ25ELFdBQU8sWUFBWSxPQUFPLHNCQUFzQixNQUFTO0FBRXpELGFBQVMsV0FBVyxpQkFBaUIsUUFBUSxFQUFFLFFBQVEsVUFBVTtBQUNqRSxXQUFPLFlBQVksT0FBTyxjQUFjLEtBQUs7QUFDN0MsV0FBTyxZQUFZLE9BQU8sa0JBQWtCLElBQUk7QUFDaEQsV0FBTyxZQUFZLE9BQU8sbUJBQW1CLE1BQVM7QUFDdEQsV0FBTyxZQUFZLE9BQU8sYUFBYSxJQUFJO0FBQzNDLFdBQU8sWUFBWSxPQUFPLGdCQUFnQixNQUFTO0FBQ25ELFdBQU8sWUFBWSxPQUFPLHNCQUFzQixNQUFTO0FBRXpELGFBQVMsV0FBVyxpQkFBaUIsUUFBUSxFQUFFLFFBQVEsYUFBYTtBQUNwRSxXQUFPLFlBQVksT0FBTyxjQUFjLElBQUk7QUFDNUMsV0FBTyxZQUFZLE9BQU8sa0JBQWtCLEtBQUs7QUFDakQsV0FBTyxZQUFZLE9BQU8sbUJBQW1CLFVBQVU7QUFDdkQsV0FBTyxZQUFZLE9BQU8sYUFBYSxVQUFVO0FBQ2pELFdBQU8sWUFBWSxPQUFPLGdCQUFnQixNQUFTO0FBQ25ELFdBQU8sWUFBWSxPQUFPLHNCQUFzQixNQUFTO0FBRXpELFdBQU8sWUFBWSxXQUFXLGlCQUFpQixRQUFRLEVBQUUsSUFBSSxVQUFVLEdBQUcsTUFBTTtBQUVoRixhQUFTLFdBQVcsaUJBQWlCLFFBQVEsRUFBRSxRQUFRLFVBQVU7QUFDakUsV0FBTyxZQUFZLE9BQU8sY0FBYyxNQUFNO0FBQzlDLFdBQU8sWUFBWSxPQUFPLGtCQUFrQixNQUFTO0FBQ3JELFdBQU8sWUFBWSxPQUFPLG1CQUFtQixNQUFNO0FBQ25ELFdBQU8sWUFBWSxPQUFPLGFBQWEsTUFBUztBQUNoRCxXQUFPLFlBQVksT0FBTyxnQkFBZ0IsTUFBUztBQUNuRCxXQUFPLFlBQVksT0FBTyxzQkFBc0IsTUFBUztBQUFBLEVBQzFELENBQUM7QUFFRCxPQUFLLGtDQUFrQyxXQUFZO0FBQ2xELFVBQU0sZUFBZSxJQUFJLEtBQUssS0FBSztBQUNuQyxVQUFNLFVBQWtELENBQUM7QUFDekQsVUFBTSxZQUFZLElBQUksbUJBQW1CO0FBQUEsTUFDeEMsVUFBVTtBQUFBLFFBQ1QsWUFBWTtBQUFBLE1BQ2I7QUFBQSxJQUNELEdBQUcsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsUUFBVyxJQUFJLGVBQWUsQ0FBQztBQUMzRCxZQUFRLEtBQUssQ0FBQyxjQUFjLFNBQVMsQ0FBQztBQUN0QyxVQUFNLG1CQUFtQix1QkFBdUI7QUFDaEQscUJBQWlCLHFCQUFxQjtBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLFdBQVcsQ0FBQyxpQkFBaUIsSUFBSSxLQUFLLEtBQUssR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNoRCxRQUFRO0FBQUEsSUFDVCxHQUFHLElBQUk7QUFDUCxVQUFNLGFBQWEsSUFBSTtBQUFBLE1BQ3RCLElBQUksY0FBYyxLQUFtQyxFQUFFO0FBQUEsTUFBRTtBQUFBLE1BQ3pEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsVUFBVSxJQUFJLG1CQUFtQjtBQUFBLFVBQ2hDLFVBQVU7QUFBQSxZQUNULFlBQVk7QUFBQSxVQUNiO0FBQUEsUUFDRCxHQUFHLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLFFBQVcsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUMzRCxRQUFRLG1CQUFtQixpQkFBaUIsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUNoRSxhQUFhLG1CQUFtQixpQkFBaUIsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUNyRSxXQUFXLElBQUksbUJBQW1CO0FBQUEsVUFDakMsVUFBVTtBQUFBLFlBQ1QsWUFBWTtBQUFBLFVBQ2I7QUFBQSxRQUNELEdBQUcsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsUUFBVyxJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQzNELFlBQVksbUJBQW1CLGlCQUFpQixJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQ3BFO0FBQUEsUUFDQTtBQUFBLFFBQ0EscUJBQXFCLENBQUM7QUFBQSxNQUN2QjtBQUFBLE1BQ0EsSUFBSSxlQUFlO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFVBQXdDLFdBQVcsaUJBQWlCLEVBQUUsUUFBUSxpQkFBaUI7QUFDbkcsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGtCQUFrQixJQUFJO0FBQ2pELFdBQU8sWUFBWSxRQUFRLG1CQUFtQixNQUFTO0FBQ3ZELFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLFlBQVksUUFBUSxzQkFBc0IsTUFBUztBQUUxRCxjQUFVLFdBQVcsaUJBQWlCLFFBQVEsRUFBRSxRQUFRLFVBQVU7QUFDbEUsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGtCQUFrQixJQUFJO0FBQ2pELFdBQU8sWUFBWSxRQUFRLG1CQUFtQixNQUFTO0FBQ3ZELFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLFlBQVksUUFBUSxzQkFBc0IsTUFBUztBQUUxRCxRQUFJLFVBQXdDLFdBQVcsaUJBQWlCLFFBQVcsWUFBWSxFQUFFLFFBQVEsaUJBQWlCO0FBQzFILFdBQU8sWUFBWSxRQUFRLGNBQWMsS0FBSztBQUM5QyxXQUFPLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUNqRCxXQUFPLFlBQVksUUFBUSxtQkFBbUIsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxhQUFhLElBQUk7QUFDNUMsV0FBTyxZQUFZLFFBQVEsZ0JBQWdCLFNBQVM7QUFDcEQsV0FBTyxZQUFZLFFBQVEsc0JBQXNCLFNBQVM7QUFFMUQsY0FBVSxXQUFXLGlCQUFpQixVQUFVLFlBQVksRUFBRSxRQUFRLFVBQVU7QUFDaEYsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGtCQUFrQixJQUFJO0FBQ2pELFdBQU8sWUFBWSxRQUFRLG1CQUFtQixNQUFTO0FBQ3ZELFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLFlBQVksUUFBUSxzQkFBc0IsU0FBUztBQUFBLEVBQzNELENBQUM7QUFFRCxPQUFLLGlDQUFpQyxXQUFZO0FBQ2pELFVBQU0sWUFBWSxJQUFJLG1CQUFtQjtBQUFBLE1BQ3hDLFVBQVU7QUFBQSxRQUNULFlBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxHQUFHLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLFFBQVcsSUFBSSxlQUFlLENBQUM7QUFFM0QsVUFBTSxZQUFZLElBQUksS0FBSyxNQUFNO0FBQ2pDLFVBQU0sYUFBYSxJQUFJLEtBQUssTUFBTTtBQUNsQyxVQUFNLFlBQVksSUFBSSxLQUFLLE1BQU07QUFDakMsVUFBTSxVQUFrRCxDQUFDO0FBQ3pELFlBQVEsS0FBSyxDQUFDLFdBQVcsSUFBSSxtQkFBbUI7QUFBQSxNQUMvQyxVQUFVO0FBQUEsUUFDVCxZQUFZO0FBQUEsUUFDWixlQUFlO0FBQUEsTUFDaEI7QUFBQSxJQUNELEdBQUcsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsUUFBVyxJQUFJLGVBQWUsQ0FBQyxDQUFDLENBQUM7QUFDN0QsWUFBUSxLQUFLLENBQUMsWUFBWSxJQUFJLG1CQUFtQjtBQUFBLE1BQ2hELFVBQVU7QUFBQSxRQUNULFlBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxHQUFHLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLFFBQVcsSUFBSSxlQUFlLENBQUMsQ0FBQyxDQUFDO0FBQzdELFlBQVEsS0FBSyxDQUFDLFdBQVcsSUFBSSxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUcsUUFBVyxJQUFJLGVBQWUsQ0FBQyxDQUFDLENBQUM7QUFFN0YsVUFBTSxtQkFBbUIsdUJBQXVCO0FBQ2hELHFCQUFpQixxQkFBcUI7QUFBQSxNQUNyQyxNQUFNO0FBQUEsTUFDTixXQUFXLENBQUMsaUJBQWlCLFdBQVcsQ0FBQyxHQUFHLGlCQUFpQixZQUFZLENBQUMsQ0FBQztBQUFBLE1BQzNFLFFBQVE7QUFBQSxJQUNULEdBQUcsSUFBSTtBQUNQLFVBQU0sYUFBYSxJQUFJO0FBQUEsTUFDdEIsSUFBSSxjQUFjLEtBQW1DLEVBQUU7QUFBQSxNQUFFO0FBQUEsTUFDekQ7QUFBQSxNQUNBO0FBQUEsUUFDQyxVQUFVLElBQUksbUJBQW1CO0FBQUEsVUFDaEMsVUFBVTtBQUFBLFlBQ1QsWUFBWTtBQUFBLFlBQ1osZUFBZTtBQUFBLFVBQ2hCO0FBQUEsUUFDRCxHQUFHLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLFFBQVcsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUMzRCxRQUFRLG1CQUFtQixpQkFBaUIsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUNoRSxhQUFhLG1CQUFtQixpQkFBaUIsSUFBSSxlQUFlLENBQUM7QUFBQSxRQUNyRSxXQUFXLElBQUksbUJBQW1CO0FBQUEsVUFDakMsVUFBVTtBQUFBLFlBQ1QsWUFBWTtBQUFBLFVBQ2I7QUFBQSxRQUNELEdBQUcsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsUUFBVyxJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQzNELFlBQVksbUJBQW1CLGlCQUFpQixJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQ3BFO0FBQUEsUUFDQTtBQUFBLFFBQ0EscUJBQXFCLENBQUM7QUFBQSxNQUN2QjtBQUFBLE1BQ0EsSUFBSSxlQUFlO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFVBQXdDLFdBQVcsaUJBQWlCLEVBQUUsUUFBUSxpQkFBaUI7QUFDbkcsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUNqRCxXQUFPLFlBQVksUUFBUSxtQkFBbUIsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLFlBQVksUUFBUSxzQkFBc0IsTUFBUztBQUUxRCxjQUFVLFdBQVcsaUJBQWlCLFFBQVEsRUFBRSxRQUFRLFVBQVU7QUFDbEUsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUNqRCxXQUFPLFlBQVksUUFBUSxtQkFBbUIsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLFlBQVksUUFBUSxzQkFBc0IsTUFBUztBQUUxRCxjQUFVLFdBQVcsaUJBQWlCLFFBQVEsRUFBRSxRQUFRLGFBQWE7QUFDckUsV0FBTyxZQUFZLFFBQVEsY0FBYyxJQUFJO0FBQzdDLFdBQU8sWUFBWSxRQUFRLGFBQWEsTUFBUztBQUNqRCxXQUFPLFlBQVksUUFBUSxrQkFBa0IsTUFBUztBQUN0RCxXQUFPLFlBQVksUUFBUSxtQkFBbUIsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsTUFBUztBQUNwRCxXQUFPLFlBQVksUUFBUSxzQkFBc0IsTUFBUztBQUUxRCxRQUFJLFVBQXdDLFdBQVcsaUJBQWlCLFFBQVcsU0FBUyxFQUFFLFFBQVEsaUJBQWlCO0FBQ3ZILFdBQU8sWUFBWSxRQUFRLGNBQWMsS0FBSztBQUM5QyxXQUFPLFlBQVksUUFBUSxhQUFhLElBQUk7QUFDNUMsV0FBTyxZQUFZLFFBQVEsa0JBQWtCLElBQUk7QUFDakQsV0FBTyxZQUFZLFFBQVEsbUJBQW1CLE1BQVM7QUFDdkQsV0FBTyxZQUFZLFFBQVEsZ0JBQWdCLFNBQVM7QUFDcEQsV0FBTyxZQUFZLFFBQVEsc0JBQXNCLEtBQUs7QUFFdEQsY0FBVSxXQUFXLGlCQUFpQixVQUFVLFNBQVMsRUFBRSxRQUFRLFVBQVU7QUFDN0UsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUNqRCxXQUFPLFlBQVksUUFBUSxtQkFBbUIsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLFlBQVksUUFBUSxzQkFBc0IsS0FBSztBQUV0RCxjQUFVLFdBQVcsaUJBQWlCLFVBQVUsU0FBUyxFQUFFLFFBQVEsYUFBYTtBQUNoRixXQUFPLFlBQVksUUFBUSxjQUFjLElBQUk7QUFDN0MsV0FBTyxZQUFZLFFBQVEsYUFBYSxNQUFTO0FBQ2pELFdBQU8sWUFBWSxRQUFRLGtCQUFrQixNQUFTO0FBQ3RELFdBQU8sWUFBWSxRQUFRLG1CQUFtQixNQUFTO0FBQ3ZELFdBQU8sWUFBWSxRQUFRLGdCQUFnQixNQUFTO0FBQ3BELFdBQU8sWUFBWSxRQUFRLHNCQUFzQixVQUFVO0FBRTNELGNBQVUsV0FBVyxpQkFBaUIsUUFBVyxVQUFVLEVBQUUsUUFBUSxpQkFBaUI7QUFDdEYsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUNqRCxXQUFPLFlBQVksUUFBUSxtQkFBbUIsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLFlBQVksUUFBUSxzQkFBc0IsSUFBSTtBQUVyRCxjQUFVLFdBQVcsaUJBQWlCLFVBQVUsVUFBVSxFQUFFLFFBQVEsVUFBVTtBQUM5RSxXQUFPLFlBQVksUUFBUSxjQUFjLEtBQUs7QUFDOUMsV0FBTyxZQUFZLFFBQVEsYUFBYSxJQUFJO0FBQzVDLFdBQU8sWUFBWSxRQUFRLGtCQUFrQixJQUFJO0FBQ2pELFdBQU8sWUFBWSxRQUFRLG1CQUFtQixNQUFTO0FBQ3ZELFdBQU8sWUFBWSxRQUFRLGdCQUFnQixTQUFTO0FBQ3BELFdBQU8sWUFBWSxRQUFRLHNCQUFzQixJQUFJO0FBRXJELGNBQVUsV0FBVyxpQkFBaUIsUUFBVyxTQUFTLEVBQUUsUUFBUSxpQkFBaUI7QUFDckYsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUNqRCxXQUFPLFlBQVksUUFBUSxtQkFBbUIsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLEdBQUcsT0FBTyxLQUFLLE9BQU8sRUFBRSxRQUFRLHNCQUFzQixNQUFNLEVBQUU7QUFDckUsV0FBTyxZQUFZLFFBQVEsc0JBQXNCLE1BQVM7QUFFMUQsY0FBVSxXQUFXLGlCQUFpQixVQUFVLFNBQVMsRUFBRSxRQUFRLFVBQVU7QUFDN0UsV0FBTyxZQUFZLFFBQVEsY0FBYyxLQUFLO0FBQzlDLFdBQU8sWUFBWSxRQUFRLGFBQWEsSUFBSTtBQUM1QyxXQUFPLFlBQVksUUFBUSxrQkFBa0IsSUFBSTtBQUNqRCxXQUFPLFlBQVksUUFBUSxtQkFBbUIsTUFBUztBQUN2RCxXQUFPLFlBQVksUUFBUSxnQkFBZ0IsU0FBUztBQUNwRCxXQUFPLEdBQUcsT0FBTyxLQUFLLE9BQU8sRUFBRSxRQUFRLHNCQUFzQixNQUFNLEVBQUU7QUFDckUsV0FBTyxZQUFZLFFBQVEsc0JBQXNCLE1BQVM7QUFBQSxFQUMzRCxDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsV0FBWTtBQUNuRCxVQUFNLFlBQVksSUFBSSxLQUFLLE1BQU07QUFDakMsVUFBTSxhQUFhLElBQUksS0FBSyxNQUFNO0FBQ2xDLFVBQU0sVUFBa0QsQ0FBQztBQUN6RCxZQUFRLEtBQUssQ0FBQyxXQUFXLHFCQUFxQjtBQUFBLE1BQzdDLG1CQUFtQjtBQUFBLE1BQ25CLGdCQUFnQjtBQUFBLFFBQ2YsbUJBQW1CO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUMsQ0FBQyxDQUFDO0FBQ0gsWUFBUSxLQUFLLENBQUMsWUFBWSxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUVuRCxVQUFNLG1CQUFtQix1QkFBdUI7QUFDaEQscUJBQWlCLHFCQUFxQjtBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLFdBQVcsQ0FBQyxpQkFBaUIsV0FBVyxDQUFDLEdBQUcsaUJBQWlCLFlBQVksQ0FBQyxDQUFDO0FBQUEsTUFDM0UsUUFBUTtBQUFBLElBQ1QsR0FBRyxJQUFJO0FBQ1AsVUFBTSxhQUFhLElBQUk7QUFBQSxNQUN0QixJQUFJLGNBQWMsS0FBbUMsRUFBRTtBQUFBLE1BQUU7QUFBQSxNQUN6RDtBQUFBLE1BQ0E7QUFBQSxRQUNDLFVBQVUscUJBQXFCO0FBQUEsVUFDOUIsbUJBQW1CO0FBQUEsVUFDbkIsY0FBYztBQUFBLFlBQ2IsbUJBQW1CO0FBQUEsVUFDcEI7QUFBQSxRQUNELENBQUM7QUFBQSxRQUNELFFBQVEsbUJBQW1CLGlCQUFpQixJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQ2hFLGFBQWEsbUJBQW1CLGlCQUFpQixJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQ3JFLFdBQVcscUJBQXFCO0FBQUEsVUFDL0IsbUJBQW1CO0FBQUEsVUFDbkIsZ0JBQWdCO0FBQUEsWUFDZixzQkFBc0I7QUFBQSxVQUN2QjtBQUFBLFFBQ0QsQ0FBQztBQUFBLFFBQ0QsWUFBWSxtQkFBbUIsaUJBQWlCLElBQUksZUFBZSxDQUFDO0FBQUEsUUFDcEUsV0FBVyxxQkFBcUI7QUFBQSxVQUMvQixnQkFBZ0I7QUFBQSxZQUNmLG1CQUFtQjtBQUFBLFlBQ25CLHNCQUFzQjtBQUFBLFVBQ3ZCO0FBQUEsUUFDRCxDQUFDO0FBQUEsUUFDRDtBQUFBLFFBQ0EscUJBQXFCLENBQUM7QUFBQSxNQUN2QjtBQUFBLE1BQ0EsSUFBSSxlQUFlO0FBQUEsSUFDcEI7QUFFQSxRQUFJLFNBQXVDLFdBQVcsaUJBQWlCLFFBQVcsRUFBRSxLQUFLLFdBQVcsWUFBWSxhQUFhLENBQUMsRUFBRSxRQUFRLGlCQUFpQjtBQUN6SixXQUFPLFlBQVksT0FBTyxjQUFjLEtBQUs7QUFDN0MsV0FBTyxZQUFZLE9BQU8sYUFBYSxTQUFTO0FBQ2hELFdBQU8sWUFBWSxPQUFPLGtCQUFrQixTQUFTO0FBQ3JELFdBQU8sWUFBWSxPQUFPLG1CQUFtQixNQUFTO0FBQ3RELFdBQU8sWUFBWSxPQUFPLGdCQUFnQixNQUFTO0FBQ25ELFdBQU8sWUFBWSxPQUFPLHNCQUFzQixTQUFTO0FBQ3pELFdBQU8sWUFBWSxPQUFPLHNCQUFzQixNQUFTO0FBQ3pELFdBQU8sWUFBWSxPQUFPLHFCQUFxQixNQUFTO0FBQ3hELFdBQU8sWUFBWSxPQUFPLHdCQUF3QixXQUFXO0FBQzdELFdBQU8sWUFBWSxPQUFPLDhCQUE4QixXQUFXO0FBQ25FLFdBQU8sZ0JBQWdCLE9BQU8sYUFBYSxDQUFDLFlBQVksWUFBWSxDQUFDO0FBRXJFLGFBQVMsV0FBVyxpQkFBaUIsUUFBVyxFQUFFLEtBQUssWUFBWSxZQUFZLGFBQWEsQ0FBQyxFQUFFLFFBQVEsaUJBQWlCO0FBQ3hILFdBQU8sWUFBWSxPQUFPLGNBQWMsS0FBSztBQUM3QyxXQUFPLFlBQVksT0FBTyxhQUFhLFNBQVM7QUFDaEQsV0FBTyxZQUFZLE9BQU8sa0JBQWtCLFNBQVM7QUFDckQsV0FBTyxZQUFZLE9BQU8sbUJBQW1CLE1BQVM7QUFDdEQsV0FBTyxZQUFZLE9BQU8sZ0JBQWdCLE1BQVM7QUFDbkQsV0FBTyxZQUFZLE9BQU8sc0JBQXNCLE1BQVM7QUFDekQsV0FBTyxZQUFZLE9BQU8sc0JBQXNCLE1BQVM7QUFDekQsV0FBTyxZQUFZLE9BQU8scUJBQXFCLE1BQVM7QUFDeEQsV0FBTyxZQUFZLE9BQU8sd0JBQXdCLFdBQVc7QUFDN0QsV0FBTyxZQUFZLE9BQU8sOEJBQThCLE1BQVM7QUFDakUsV0FBTyxnQkFBZ0IsT0FBTyxhQUFhLENBQUMsWUFBWSxZQUFZLENBQUM7QUFBQSxFQUN0RSxDQUFDO0FBRUQsT0FBSyxxQ0FBcUMsTUFBTTtBQUUvQyxVQUFNLGFBQWEsSUFBSTtBQUFBLE1BQ3RCLElBQUksY0FBYyxLQUFtQyxFQUFFO0FBQUEsTUFBRTtBQUFBLE1BQ3pELHVCQUF1QjtBQUFBLE1BQ3ZCO0FBQUEsUUFDQyxVQUFVLElBQUksbUJBQW1CO0FBQUEsVUFDaEMsVUFBVTtBQUFBLFlBQ1QsWUFBWTtBQUFBLFlBQ1osZUFBZTtBQUFBLFlBQ2YsWUFBWTtBQUFBLFVBQ2I7QUFBQSxRQUNELEdBQUcsQ0FBQyxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsUUFBVyxJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQzNELFFBQVEsbUJBQW1CLGlCQUFpQixJQUFJLGVBQWUsQ0FBQztBQUFBLFFBQ2hFLGFBQWEsSUFBSSxtQkFBbUI7QUFBQSxVQUNuQyxVQUFVO0FBQUEsWUFDVCxZQUFZO0FBQUEsVUFDYjtBQUFBLFFBQ0QsR0FBRyxDQUFDLGlCQUFpQixHQUFHLENBQUMsR0FBRyxRQUFXLElBQUksZUFBZSxDQUFDO0FBQUEsUUFDM0QsV0FBVyxJQUFJLG1CQUFtQjtBQUFBLFVBQ2pDLFVBQVU7QUFBQSxZQUNULFlBQVk7QUFBQSxZQUNaLGVBQWU7QUFBQSxVQUNoQjtBQUFBLFFBQ0QsR0FBRyxDQUFDLGlCQUFpQixHQUFHLENBQUMsR0FBRyxRQUFXLElBQUksZUFBZSxDQUFDO0FBQUEsUUFDM0QsWUFBWSxtQkFBbUIsaUJBQWlCLElBQUksZUFBZSxDQUFDO0FBQUEsUUFDcEUsV0FBVyxJQUFJLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxRQUFXLElBQUksZUFBZSxDQUFDO0FBQUEsUUFDN0UsU0FBUyxDQUFDO0FBQUEsUUFDVixxQkFBcUIsQ0FBQztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxJQUFJLGVBQWU7QUFBQSxJQUNwQjtBQUVBLFFBQUksU0FBdUMsV0FBVyxpQkFBaUIsRUFBRSxRQUFRLGlCQUFpQjtBQUNsRyxXQUFPLFlBQVksT0FBTyxjQUFjLEtBQUs7QUFDN0MsV0FBTyxZQUFZLE9BQU8sYUFBYSxNQUFNO0FBQzdDLFdBQU8sWUFBWSxPQUFPLGtCQUFrQixNQUFNO0FBQ2xELFdBQU8sWUFBWSxPQUFPLG1CQUFtQixNQUFTO0FBQ3RELFdBQU8sWUFBWSxPQUFPLGdCQUFnQixNQUFTO0FBQ25ELFdBQU8sWUFBWSxPQUFPLHNCQUFzQixNQUFTO0FBQ3pELFdBQU8sWUFBWSxXQUFXLGlCQUFpQixFQUFFLElBQUksaUJBQWlCLEdBQUcsTUFBTTtBQUUvRSxhQUFTLFdBQVcsaUJBQWlCLEVBQUUsUUFBUSxvQkFBb0I7QUFDbkUsV0FBTyxZQUFZLE9BQU8sY0FBYyxJQUFJO0FBQzVDLFdBQU8sWUFBWSxPQUFPLGFBQWEsS0FBSztBQUM1QyxXQUFPLFlBQVksT0FBTyxrQkFBa0IsS0FBSztBQUNqRCxXQUFPLFlBQVksT0FBTyxtQkFBbUIsTUFBUztBQUN0RCxXQUFPLFlBQVksT0FBTyxnQkFBZ0IsTUFBUztBQUNuRCxXQUFPLFlBQVksT0FBTyxzQkFBc0IsTUFBUztBQUN6RCxXQUFPLFlBQVksV0FBVyxpQkFBaUIsRUFBRSxJQUFJLG9CQUFvQixHQUFHLEtBQUs7QUFFakYsYUFBUyxXQUFXLGlCQUFpQixFQUFFLFFBQVEsaUJBQWlCO0FBQ2hFLFdBQU8sWUFBWSxPQUFPLGNBQWMsTUFBTTtBQUM5QyxXQUFPLFlBQVksT0FBTyxrQkFBa0IsTUFBUztBQUNyRCxXQUFPLFlBQVksT0FBTyxtQkFBbUIsTUFBUztBQUN0RCxXQUFPLFlBQVksT0FBTyxhQUFhLE1BQVM7QUFDaEQsV0FBTyxZQUFZLE9BQU8sZ0JBQWdCLE1BQVM7QUFDbkQsV0FBTyxZQUFZLE9BQU8sc0JBQXNCLE1BQVM7QUFDekQsV0FBTyxZQUFZLFdBQVcsaUJBQWlCLEVBQUUsSUFBSSxpQkFBaUIsR0FBRyxNQUFNO0FBQUEsRUFDaEYsQ0FBQztBQUVELE9BQUssMkJBQTJCLFdBQVk7QUFFM0MsVUFBTSxNQUFNLDJCQUEyQjtBQUFBLE1BQ3RDLFVBQVU7QUFBQSxRQUNULFdBQVc7QUFBQSxRQUNYLFdBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRCxDQUFDO0FBRUQsUUFBSSxTQUFTLElBQUksaUJBQWlCLGdCQUFnQjtBQUNsRCxXQUFPLFlBQVksT0FBTyxJQUFJLEVBQUUsR0FBRyxNQUFTO0FBQzVDLFdBQU8sWUFBWSxPQUFPLElBQUksRUFBRSxHQUFHLEtBQUs7QUFFeEMsYUFBUyxJQUFJLGlCQUFpQixRQUFRO0FBQ3RDLFdBQU8sWUFBWSxPQUFPLElBQUksU0FBUyxHQUFHLElBQUk7QUFDOUMsV0FBTyxZQUFZLE9BQU8sSUFBSSxTQUFTLEdBQUcsSUFBSTtBQUFBLEVBQy9DLENBQUM7QUFFRCxPQUFLLG9CQUFvQixXQUFZO0FBQ3BDLFVBQU0sTUFBTSwyQkFBMkI7QUFBQSxNQUN0QyxVQUFVO0FBQUEsUUFDVCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sU0FBUyxJQUFJLGlCQUFpQixRQUFRO0FBRTVDLFdBQU8sR0FBRyxPQUFPLElBQUksS0FBSyxDQUFDO0FBQzNCLFdBQU8sWUFBWSxPQUFPLElBQUksS0FBSyxHQUFHLFVBQVU7QUFDaEQsV0FBTyxnQkFBZ0IsT0FBTyxLQUFLLEdBQUcsT0FBTyxHQUFHO0FBRWhELFdBQU8sT0FBTyxNQUFNLE9BQU8sS0FBSyxJQUFTLFVBQVU7QUFBQSxFQUNwRCxDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsV0FBWTtBQUNqRCxVQUFNLFFBQVEsSUFBSSxlQUFlO0FBQ2pDLFVBQU0sWUFBWSwyQkFBMkI7QUFBQSxNQUM1QyxPQUFPO0FBQUEsUUFDTixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsR0FBRyxLQUFLO0FBRVIsVUFBTSxTQUFTLFVBQVUsaUJBQWlCLEtBQUs7QUFDL0MsV0FBTyxPQUFPLE9BQU8sRUFBRTtBQUV2QixXQUFPLFlBQVksTUFBTSxTQUFTLENBQUMsR0FBRyxJQUFJO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUsseUJBQXlCLFdBQVk7QUFFekMsVUFBTSxRQUFRLElBQUksZUFBZTtBQUNqQyxVQUFNLFlBQVksMkJBQTJCO0FBQUEsTUFDNUMsT0FBTztBQUFBLFFBQ04sT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEdBQUcsS0FBSztBQUVSLFFBQUksU0FBUyxVQUFVLGlCQUFpQixLQUFLO0FBQzdDLFdBQU8sT0FBTyxPQUFPLElBQUksSUFBSTtBQUU3QixXQUFPLFlBQVksTUFBTSxTQUFTLENBQUMsR0FBRyxvQkFBb0IsSUFBSTtBQUM5RCxXQUFPLFlBQVksTUFBTSxTQUFTLENBQUMsR0FBRyxTQUFTO0FBQy9DLFdBQU8sWUFBWSxNQUFNLFNBQVMsQ0FBQyxHQUFHLEVBQUU7QUFFeEMsYUFBUyxVQUFVLGlCQUFpQixFQUFFO0FBQ3RDLFdBQU8sT0FBTyxPQUFPLElBQUksSUFBSTtBQUM3QixXQUFPLFlBQVksTUFBTSxTQUFTLENBQUMsR0FBRyxLQUFLO0FBRTNDLFdBQU8sT0FBTyxXQUFXLElBQUksSUFBSTtBQUNqQyxXQUFPLFlBQVksTUFBTSxTQUFTLENBQUMsR0FBRyxTQUFTO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssMEJBQTBCLFdBQVk7QUFDMUMsVUFBTSxRQUFRLElBQUksZUFBZTtBQUNqQyxVQUFNLFlBQVksMkJBQTJCO0FBQUEsTUFDNUMsVUFBVTtBQUFBLFFBQ1QsZ0JBQWdCO0FBQUEsTUFDakI7QUFBQSxJQUNELEdBQUcsS0FBSztBQUVSLGNBQVUsaUJBQWlCLFFBQVEsRUFBRSxPQUFPLGdCQUFnQixFQUFFLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUNsRixXQUFPLFlBQVksTUFBTSxTQUFTLENBQUMsR0FBRyxxQkFBcUI7QUFDM0QsV0FBTyxnQkFBZ0IsTUFBTSxTQUFTLENBQUMsR0FBRyxFQUFFLFlBQVksQ0FBQyxJQUFJLEVBQUUsQ0FBQztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLDZCQUE2QixXQUFZO0FBRTdDLFVBQU0sUUFBUSxJQUFJLGNBQWMsS0FBbUMsRUFBRTtBQUFBLE1BQzNELDJCQUEyQixRQUE2QixLQUFhLE9BQTBCO0FBQ3ZHLGVBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxhQUFhLENBQUM7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFFQSxXQUFPLDJCQUEyQixDQUFDLEdBQUcsS0FBSyxFQUN6QyxpQkFBaUIsRUFBRSxFQUNuQixPQUFPLElBQUksTUFBTSxLQUFLLEVBQ3RCLEtBQUssTUFBTSxPQUFPLEdBQUcsS0FBSyxHQUFHLFNBQU87QUFBQSxJQUE0QixDQUFDO0FBQUEsRUFDcEUsQ0FBQztBQUVELE9BQUssOEJBQThCLENBQUMsU0FBUztBQUU1QyxVQUFNLGtCQUFrQixpQkFBaUIsSUFBSSxLQUFLLFNBQVMsR0FBRyxDQUFDO0FBQy9ELFVBQU0sbUJBQW1CLHVCQUF1QjtBQUNoRCxxQkFBaUIscUJBQXFCO0FBQUEsTUFDckMsTUFBTTtBQUFBLE1BQ04sV0FBVyxDQUFDLGVBQWU7QUFBQSxNQUMzQixRQUFRO0FBQUEsSUFDVCxHQUFHLElBQUk7QUFDUCxVQUFNLGFBQWEsSUFBSTtBQUFBLE1BQ3RCLElBQUksY0FBYyxLQUFtQyxFQUFFO0FBQUEsTUFBRTtBQUFBLE1BQ3pEO0FBQUEsTUFDQSx3QkFBd0I7QUFBQSxRQUN2QixVQUFVO0FBQUEsVUFDVCxVQUFVO0FBQUEsVUFDVixpQkFBaUI7QUFBQSxRQUNsQjtBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQ0QsSUFBSSxlQUFlO0FBQUEsSUFDcEI7QUFFQSxVQUFNLGdCQUFnQix3QkFBd0I7QUFBQSxNQUM3QyxVQUFVO0FBQUEsUUFDVCxVQUFVO0FBQUEsUUFDVixpQkFBaUI7QUFBQSxRQUNqQixhQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sa0JBQXdDLEVBQUUsTUFBTSxDQUFDLHdCQUF3QixrQkFBa0IsR0FBRyxXQUFXLENBQUMsRUFBRTtBQUNsSCxVQUFNLElBQUksV0FBVyx5QkFBeUIsT0FBSztBQUVsRCxhQUFPLGdCQUFnQixXQUFXLGlCQUFpQixFQUFFLElBQUksUUFBUSxHQUFHO0FBQUEsUUFDbkUsVUFBVTtBQUFBLFFBQ1YsaUJBQWlCO0FBQUEsUUFDakIsYUFBYTtBQUFBLE1BQ2QsQ0FBQztBQUVELGFBQU8sR0FBRyxFQUFFLHFCQUFxQixRQUFRLENBQUM7QUFDMUMsYUFBTyxHQUFHLEVBQUUscUJBQXFCLFVBQVUsZ0JBQWdCLEdBQUcsQ0FBQztBQUMvRCxhQUFPLEdBQUcsRUFBRSxxQkFBcUIsVUFBVSxJQUFJLEtBQUssS0FBSyxDQUFDLENBQUM7QUFFM0QsYUFBTyxHQUFHLEVBQUUscUJBQXFCLHNCQUFzQixDQUFDO0FBQ3hELGFBQU8sR0FBRyxFQUFFLHFCQUFxQix3QkFBd0IsZ0JBQWdCLEdBQUcsQ0FBQztBQUM3RSxhQUFPLEdBQUcsRUFBRSxxQkFBcUIsd0JBQXdCLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQztBQUV6RSxhQUFPLEdBQUcsRUFBRSxxQkFBcUIsa0JBQWtCLENBQUM7QUFDcEQsYUFBTyxHQUFHLEVBQUUscUJBQXFCLG9CQUFvQixnQkFBZ0IsR0FBRyxDQUFDO0FBQ3pFLGFBQU8sR0FBRyxFQUFFLHFCQUFxQixvQkFBb0IsSUFBSSxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBRXJFLGFBQU8sR0FBRyxDQUFDLEVBQUUscUJBQXFCLGVBQWUsQ0FBQztBQUNsRCxhQUFPLEdBQUcsQ0FBQyxFQUFFLHFCQUFxQixpQkFBaUIsZ0JBQWdCLEdBQUcsQ0FBQztBQUN2RSxhQUFPLEdBQUcsQ0FBQyxFQUFFLHFCQUFxQixpQkFBaUIsSUFBSSxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQ25FLFdBQUs7QUFBQSxJQUNOLENBQUMsQ0FBQztBQUVGLGVBQVcsNEJBQTRCLGVBQWUsZUFBZTtBQUFBLEVBQ3RFLENBQUM7QUFFRCxPQUFLLHNDQUFzQyxXQUFZO0FBQ3RELFVBQU0sYUFBYSwyQkFBMkIsRUFBRSxPQUFPLEVBQUUsT0FBTyxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBRXRFLFVBQU0sUUFBa0IsV0FBVyxpQkFBaUIsRUFBRSxJQUFJLFdBQVcsQ0FBQyxDQUFDO0FBQ3ZFLFVBQU0sS0FBSyxHQUFHO0FBRWQsVUFBTSxTQUFTLFdBQVcsaUJBQWlCLEVBQUUsSUFBSSxXQUFXLENBQUMsQ0FBQztBQUM5RCxXQUFPLGdCQUFnQixRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ2xDLENBQUM7QUFFRCxXQUFTLGlCQUFpQixLQUFVLE9BQWUsT0FBZSxJQUFzQjtBQUN2RixXQUFPLElBQUksZ0JBQWdCLEVBQUUsS0FBSyxNQUFNLE1BQU0sQ0FBQztBQUFBLEVBQ2hEO0FBRUEsV0FBUyxxQkFBcUIsS0FBOEI7QUFDM0QsVUFBTSxTQUFTLElBQUkseUJBQXlCLFFBQVEsSUFBSSxlQUFlLENBQUM7QUFDeEUsV0FBTyxNQUFNLEtBQUssVUFBVSxHQUFHLENBQUM7QUFDaEMsV0FBTyxPQUFPO0FBQUEsRUFDZjtBQUVELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
