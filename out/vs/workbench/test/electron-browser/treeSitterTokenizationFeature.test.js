import assert from "assert";
import { TestInstantiationService } from "../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { Event } from "../../../base/common/event.js";
import { URI } from "../../../base/common/uri.js";
import { IFileService } from "../../../platform/files/common/files.js";
import { ILogService, NullLogService } from "../../../platform/log/common/log.js";
import { ITelemetryService, TelemetryLevel } from "../../../platform/telemetry/common/telemetry.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../platform/configuration/test/common/testConfigurationService.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { ModelService } from "../../../editor/common/services/modelService.js";
import { FileService } from "../../../platform/files/common/fileService.js";
import { Schemas } from "../../../base/common/network.js";
import { TestIPCFileSystemProvider } from "./workbenchTestServices.js";
import { ILanguageService } from "../../../editor/common/languages/language.js";
import { LanguageService } from "../../../editor/common/services/languageService.js";
import { TestColorTheme, TestThemeService } from "../../../platform/theme/test/common/testThemeService.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { ITextResourcePropertiesService } from "../../../editor/common/services/textResourceConfiguration.js";
import { TestTextResourcePropertiesService } from "../common/workbenchTestServices.js";
import { TestLanguageConfigurationService } from "../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { ILanguageConfigurationService } from "../../../editor/common/languages/languageConfigurationRegistry.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../platform/undoRedo/common/undoRedoService.js";
import { TestDialogService } from "../../../platform/dialogs/test/common/testDialogService.js";
import { TestNotificationService } from "../../../platform/notification/test/common/testNotificationService.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { TokenStyle } from "../../../platform/theme/common/tokenClassificationRegistry.js";
import { Color } from "../../../base/common/color.js";
import { Range } from "../../../editor/common/core/range.js";
import { ITreeSitterLibraryService } from "../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { TreeSitterLibraryService } from "../../services/treeSitter/browser/treeSitterLibraryService.js";
import { autorunHandleChanges, recordChanges, waitForState } from "../../../base/common/observable.js";
import { ITreeSitterThemeService } from "../../../editor/common/services/treeSitter/treeSitterThemeService.js";
import { TreeSitterThemeService } from "../../services/treeSitter/browser/treeSitterThemeService.js";
class MockTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.NONE;
    this.sessionId = "";
    this.machineId = "";
    this.sqmId = "";
    this.devDeviceId = "";
    this.firstSessionDate = "";
    this.sendErrorTelemetry = false;
  }
  publicLog(eventName, data) {
  }
  publicLog2(eventName, data) {
  }
  publicLogError(errorEventName, data) {
  }
  publicLogError2(eventName, data) {
  }
  setExperimentProperty(name, value) {
  }
  setCommonProperty(name, value) {
  }
}
class TestTreeSitterColorTheme extends TestColorTheme {
  resolveScopes(scopes, definitions) {
    return new TokenStyle(Color.red, void 0, void 0, void 0, void 0);
  }
  getTokenColorIndex() {
    return { get: () => 10 };
  }
}
suite("Tree Sitter TokenizationFeature", function() {
  let instantiationService;
  let modelService;
  let fileService;
  let textResourcePropertiesService;
  let languageConfigurationService;
  let telemetryService;
  let logService;
  let configurationService;
  let themeService;
  let languageService;
  let environmentService;
  let disposables;
  setup(async () => {
    disposables = new DisposableStore();
    instantiationService = disposables.add(new TestInstantiationService());
    telemetryService = new MockTelemetryService();
    logService = new NullLogService();
    configurationService = new TestConfigurationService({ "editor.experimental.preferTreeSitter.typescript": true });
    themeService = new TestThemeService(new TestTreeSitterColorTheme());
    environmentService = {};
    instantiationService.set(IEnvironmentService, environmentService);
    instantiationService.set(IConfigurationService, configurationService);
    instantiationService.set(ILogService, logService);
    instantiationService.set(ITelemetryService, telemetryService);
    languageService = disposables.add(instantiationService.createInstance(LanguageService));
    instantiationService.set(ILanguageService, languageService);
    instantiationService.set(IThemeService, themeService);
    textResourcePropertiesService = instantiationService.createInstance(TestTextResourcePropertiesService);
    instantiationService.set(ITextResourcePropertiesService, textResourcePropertiesService);
    languageConfigurationService = disposables.add(instantiationService.createInstance(TestLanguageConfigurationService));
    instantiationService.set(ILanguageConfigurationService, languageConfigurationService);
    fileService = disposables.add(instantiationService.createInstance(FileService));
    const fileSystemProvider = new TestIPCFileSystemProvider();
    disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    instantiationService.set(IFileService, fileService);
    const libraryService = disposables.add(instantiationService.createInstance(TreeSitterLibraryService));
    libraryService.isTest = true;
    instantiationService.set(ITreeSitterLibraryService, libraryService);
    instantiationService.set(ITreeSitterThemeService, instantiationService.createInstance(TreeSitterThemeService));
    const dialogService = new TestDialogService();
    const notificationService = new TestNotificationService();
    const undoRedoService = new UndoRedoService(dialogService, notificationService);
    instantiationService.set(IUndoRedoService, undoRedoService);
    modelService = new ModelService(
      configurationService,
      textResourcePropertiesService,
      undoRedoService,
      instantiationService
    );
    instantiationService.set(IModelService, modelService);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function tokensContentSize(tokens) {
    return tokens[tokens.length - 1].startOffsetInclusive + tokens[tokens.length - 1].length;
  }
  let nameNumber = 1;
  async function getModelAndPrepTree(content) {
    const model = disposables.add(modelService.createModel(content, { languageId: "typescript", onDidChange: Event.None }, URI.file(`file${nameNumber++}.ts`)));
    const treeSitterTreeObs = disposables.add(model.tokenization.tokens.get()).tree;
    const tokenizationImplObs = disposables.add(model.tokenization.tokens.get()).tokenizationImpl;
    const treeSitterTree = treeSitterTreeObs.get() ?? await waitForState(treeSitterTreeObs);
    if (!treeSitterTree.tree.get()) {
      await waitForState(treeSitterTree.tree);
    }
    const tokenizationImpl = tokenizationImplObs.get() ?? await waitForState(tokenizationImplObs);
    assert.ok(treeSitterTree);
    return { model, treeSitterTree, tokenizationImpl };
  }
  function verifyTokens(tokens) {
    assert.ok(tokens);
    for (let i = 1; i < tokens.length; i++) {
      const previousToken = tokens[i - 1];
      const token = tokens[i];
      assert.deepStrictEqual(previousToken.startOffsetInclusive + previousToken.length, token.startOffsetInclusive);
    }
  }
  test("Three changes come back to back ", async () => {
    const content = `/**
**/
class x {
}




class y {
}`;
    const { model, treeSitterTree } = await getModelAndPrepTree(content);
    let updateListener;
    const changePromise = new Promise((resolve) => {
      updateListener = autorunHandleChanges({
        owner: this,
        changeTracker: recordChanges({ tree: treeSitterTree.tree })
      }, (reader, ctx) => {
        const changeEvent = ctx.changes.at(0)?.change;
        if (changeEvent) {
          resolve(changeEvent);
        }
      });
    });
    const edit1 = new Promise((resolve) => {
      model.applyEdits([{ range: new Range(7, 1, 8, 1), text: "" }]);
      resolve();
    });
    const edit2 = new Promise((resolve) => {
      model.applyEdits([{ range: new Range(6, 1, 7, 1), text: "" }]);
      resolve();
    });
    const edit3 = new Promise((resolve) => {
      model.applyEdits([{ range: new Range(5, 1, 6, 1), text: "" }]);
      resolve();
    });
    const edits = Promise.all([edit1, edit2, edit3]);
    const change = await changePromise;
    await edits;
    assert.ok(change);
    assert.strictEqual(change.versionId, 4);
    assert.strictEqual(change.ranges[0].newRangeStartOffset, 0);
    assert.strictEqual(change.ranges[0].newRangeEndOffset, 32);
    assert.strictEqual(change.ranges[0].newRange.startLineNumber, 1);
    assert.strictEqual(change.ranges[0].newRange.endLineNumber, 7);
    updateListener?.dispose();
    modelService.destroyModel(model.uri);
  });
  test("File single line file", async () => {
    const content = `console.log('x');`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 1, 18), 0, 17);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 9);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with new lines at beginning and end", async () => {
    const content = `
console.log('x');
`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 3, 1), 0, 19);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 11);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with new lines at beginning and end \\r\\n", async () => {
    const content = "\r\nconsole.log('x');\r\n";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 3, 1), 0, 21);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 11);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with empty lines in the middle", async () => {
    const content = `
console.log('x');

console.log('7');
`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 38);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 21);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with empty lines in the middle \\r\\n", async () => {
    const content = "\r\nconsole.log('x');\r\n\r\nconsole.log('7');\r\n";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 42);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 21);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with non-empty lines that match no scopes", async () => {
    const content = `console.log('x');
;
{
}
`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 24);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 16);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with non-empty lines that match no scopes \\r\\n", async () => {
    const content = "console.log('x');\r\n;\r\n{\r\n}\r\n";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 5, 1), 0, 28);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 16);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with tree-sitter token that spans multiple lines", async () => {
    const content = `/**
**/

console.log('x');

`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 1), 0, 28);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 12);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with tree-sitter token that spans multiple lines \\r\\n", async () => {
    const content = "/**\r\n**/\r\n\r\nconsole.log('x');\r\n\r\n";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 1), 0, 33);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 12);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with tabs", async () => {
    const content = `function x() {
	return true;
}

class Y {
	private z = false;
}`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 7, 1), 0, 63);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 30);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("File with tabs \\r\\n", async () => {
    const content = "function x() {\r\n	return true;\r\n}\r\n\r\nclass Y {\r\n	private z = false;\r\n}";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 7, 1), 0, 69);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 30);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("Template string", async () => {
    const content = "`t ${6}`";
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 1, 8), 0, 8);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 6);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
  test("Many nested scopes", async () => {
    const content = `y = new x(ttt({
	message: '{0} i\\n\\n [commandName]({1}).',
	args: ['Test', \`command:\${openSettingsCommand}?\${encodeURIComponent('["SettingName"]')}\`],
	// To make sure the translators don't break the link
	comment: ["{Locked=']({'}"]
}));`;
    const { model, tokenizationImpl } = await getModelAndPrepTree(content);
    const tokens = tokenizationImpl.getTokensInRange(new Range(1, 1, 6, 5), 0, 238);
    verifyTokens(tokens);
    assert.deepStrictEqual(tokens?.length, 65);
    assert.deepStrictEqual(tokensContentSize(tokens), content.length);
    modelService.destroyModel(model.uri);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvdHJlZVNpdHRlclRva2VuaXphdGlvbkZlYXR1cmUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhLCBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDbGFzc2lmaWVkRXZlbnQsIE9taXRNZXRhZGF0YSwgSUdEUFJQcm9wZXJ0eSwgU3RyaWN0UHJvcGVydHlDaGVjayB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vZ2RwclR5cGluZ3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLmpzJztcblxuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVGVzdElQQ0ZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29sb3JUaGVtZSwgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vbW9kZXMvdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IFVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkb1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdERpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL3Rlc3QvY29tbW9uL3Rlc3REaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUHJvYmVTY29wZSwgVG9rZW5TdHlsZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGV4dE1hdGVUaGVtaW5nUnVsZURlZmluaXRpb25zIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi9jb2xvclRoZW1lRGF0YS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRva2VuVXBkYXRlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90b2tlbnMvdHJlZVNpdHRlci90b2tlblN0b3JlLmpzJztcbmltcG9ydCB7IElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvYnJvd3Nlci90cmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdG9rZW5zL3Rva2VuaXphdGlvblRleHRNb2RlbFBhcnQuanMnO1xuaW1wb3J0IHsgVHJlZVNpdHRlclN5bnRheFRva2VuQmFja2VuZCB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdG9rZW5zL3RyZWVTaXR0ZXIvdHJlZVNpdHRlclN5bnRheFRva2VuQmFja2VuZC5qcyc7XG5pbXBvcnQgeyBUcmVlUGFyc2VVcGRhdGVFdmVudCwgVHJlZVNpdHRlclRyZWUgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy90cmVlU2l0dGVyL3RyZWVTaXR0ZXJUcmVlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJUb2tlbml6YXRpb25JbXBsIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90b2tlbnMvdHJlZVNpdHRlci90cmVlU2l0dGVyVG9rZW5pemF0aW9uSW1wbC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuSGFuZGxlQ2hhbmdlcywgcmVjb3JkQ2hhbmdlcywgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJVHJlZVNpdHRlclRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVNpdHRlci90cmVlU2l0dGVyVGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90cmVlU2l0dGVyL2Jyb3dzZXIvdHJlZVNpdHRlclRoZW1lU2VydmljZS5qcyc7XG5cbmNsYXNzIE1vY2tUZWxlbWV0cnlTZXJ2aWNlIGltcGxlbWVudHMgSVRlbGVtZXRyeVNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHRlbGVtZXRyeUxldmVsOiBUZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLk5PTkU7XG5cdHNlc3Npb25JZDogc3RyaW5nID0gJyc7XG5cdG1hY2hpbmVJZDogc3RyaW5nID0gJyc7XG5cdHNxbUlkOiBzdHJpbmcgPSAnJztcblx0ZGV2RGV2aWNlSWQ6IHN0cmluZyA9ICcnO1xuXHRmaXJzdFNlc3Npb25EYXRlOiBzdHJpbmcgPSAnJztcblx0c2VuZEVycm9yVGVsZW1ldHJ5OiBib29sZWFuID0gZmFsc2U7XG5cdHB1YmxpY0xvZyhldmVudE5hbWU6IHN0cmluZywgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogdm9pZCB7XG5cdH1cblx0cHVibGljTG9nMjxFIGV4dGVuZHMgQ2xhc3NpZmllZEV2ZW50PE9taXRNZXRhZGF0YTxUPj4gPSBuZXZlciwgVCBleHRlbmRzIElHRFBSUHJvcGVydHkgPSBuZXZlcj4oZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBTdHJpY3RQcm9wZXJ0eUNoZWNrPFQsIEU+KTogdm9pZCB7XG5cdH1cblx0cHVibGljTG9nRXJyb3IoZXJyb3JFdmVudE5hbWU6IHN0cmluZywgZGF0YT86IElUZWxlbWV0cnlEYXRhKTogdm9pZCB7XG5cdH1cblx0cHVibGljTG9nRXJyb3IyPEUgZXh0ZW5kcyBDbGFzc2lmaWVkRXZlbnQ8T21pdE1ldGFkYXRhPFQ+PiA9IG5ldmVyLCBUIGV4dGVuZHMgSUdEUFJQcm9wZXJ0eSA9IG5ldmVyPihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IFN0cmljdFByb3BlcnR5Q2hlY2s8VCwgRT4pOiB2b2lkIHtcblx0fVxuXHRzZXRFeHBlcmltZW50UHJvcGVydHkobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdH1cblx0c2V0Q29tbW9uUHJvcGVydHkobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdH1cbn1cblxuXG5jbGFzcyBUZXN0VHJlZVNpdHRlckNvbG9yVGhlbWUgZXh0ZW5kcyBUZXN0Q29sb3JUaGVtZSB7XG5cdHB1YmxpYyByZXNvbHZlU2NvcGVzKHNjb3BlczogUHJvYmVTY29wZVtdLCBkZWZpbml0aW9ucz86IFRleHRNYXRlVGhlbWluZ1J1bGVEZWZpbml0aW9ucyk6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBuZXcgVG9rZW5TdHlsZShDb2xvci5yZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdH1cblx0cHVibGljIGdldFRva2VuQ29sb3JJbmRleCgpOiB7IGdldDogKCkgPT4gbnVtYmVyIH0ge1xuXHRcdHJldHVybiB7IGdldDogKCkgPT4gMTAgfTtcblx0fVxufVxuXG5zdWl0ZSgnVHJlZSBTaXR0ZXIgVG9rZW5pemF0aW9uRmVhdHVyZScsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cdGxldCB0ZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZTogSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZTtcblx0bGV0IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZTtcblx0bGV0IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblx0bGV0IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZTtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRcdHRlbGVtZXRyeVNlcnZpY2UgPSBuZXcgTW9ja1RlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgJ2VkaXRvci5leHBlcmltZW50YWwucHJlZmVyVHJlZVNpdHRlci50eXBlc2NyaXB0JzogdHJ1ZSB9KTtcblx0XHR0aGVtZVNlcnZpY2UgPSBuZXcgVGVzdFRoZW1lU2VydmljZShuZXcgVGVzdFRyZWVTaXR0ZXJDb2xvclRoZW1lKCkpO1xuXHRcdGVudmlyb25tZW50U2VydmljZSA9IHt9IGFzIElFbnZpcm9ubWVudFNlcnZpY2U7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUVudmlyb25tZW50U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVRlbGVtZXRyeVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGxhbmd1YWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZVNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUxhbmd1YWdlU2VydmljZSwgbGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVRoZW1lU2VydmljZSwgdGhlbWVTZXJ2aWNlKTtcblx0XHR0ZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSwgdGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UpO1xuXHRcdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZVNlcnZpY2UpKTtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBuZXcgVGVzdElQQ0ZpbGVTeXN0ZW1Qcm92aWRlcigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuZmlsZSwgZmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbGlicmFyeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlKSk7XG5cdFx0bGlicmFyeVNlcnZpY2UuaXNUZXN0ID0gdHJ1ZTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgbGlicmFyeVNlcnZpY2UpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElUcmVlU2l0dGVyVGhlbWVTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlU2l0dGVyVGhlbWVTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gbmV3IFRlc3REaWFsb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHVuZG9SZWRvU2VydmljZSA9IG5ldyBVbmRvUmVkb1NlcnZpY2UoZGlhbG9nU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElVbmRvUmVkb1NlcnZpY2UsIHVuZG9SZWRvU2VydmljZSk7XG5cdFx0bW9kZWxTZXJ2aWNlID0gbmV3IE1vZGVsU2VydmljZShcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsXG5cdFx0XHR1bmRvUmVkb1NlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZVxuXHRcdCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElNb2RlbFNlcnZpY2UsIG1vZGVsU2VydmljZSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHRva2Vuc0NvbnRlbnRTaXplKHRva2VuczogVG9rZW5VcGRhdGVbXSkge1xuXHRcdHJldHVybiB0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLnN0YXJ0T2Zmc2V0SW5jbHVzaXZlICsgdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS5sZW5ndGg7XG5cdH1cblxuXHRsZXQgbmFtZU51bWJlciA9IDE7XG5cdGFzeW5jIGZ1bmN0aW9uIGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx7IG1vZGVsOiBJVGV4dE1vZGVsOyB0cmVlU2l0dGVyVHJlZTogVHJlZVNpdHRlclRyZWU7IHRva2VuaXphdGlvbkltcGw6IFRyZWVTaXR0ZXJUb2tlbml6YXRpb25JbXBsIH0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoY29udGVudCwgeyBsYW5ndWFnZUlkOiAndHlwZXNjcmlwdCcsIG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lIH0sIFVSSS5maWxlKGBmaWxlJHtuYW1lTnVtYmVyKyt9LnRzYCkpKTtcblx0XHRjb25zdCB0cmVlU2l0dGVyVHJlZU9icyA9IGRpc3Bvc2FibGVzLmFkZCgobW9kZWwudG9rZW5pemF0aW9uIGFzIFRva2VuaXphdGlvblRleHRNb2RlbFBhcnQpLnRva2Vucy5nZXQoKSBhcyBUcmVlU2l0dGVyU3ludGF4VG9rZW5CYWNrZW5kKS50cmVlO1xuXHRcdGNvbnN0IHRva2VuaXphdGlvbkltcGxPYnMgPSBkaXNwb3NhYmxlcy5hZGQoKG1vZGVsLnRva2VuaXphdGlvbiBhcyBUb2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0KS50b2tlbnMuZ2V0KCkgYXMgVHJlZVNpdHRlclN5bnRheFRva2VuQmFja2VuZCkudG9rZW5pemF0aW9uSW1wbDtcblx0XHRjb25zdCB0cmVlU2l0dGVyVHJlZSA9IHRyZWVTaXR0ZXJUcmVlT2JzLmdldCgpID8/IGF3YWl0IHdhaXRGb3JTdGF0ZSh0cmVlU2l0dGVyVHJlZU9icyk7XG5cdFx0aWYgKCF0cmVlU2l0dGVyVHJlZS50cmVlLmdldCgpKSB7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUodHJlZVNpdHRlclRyZWUudHJlZSk7XG5cdFx0fVxuXHRcdGNvbnN0IHRva2VuaXphdGlvbkltcGwgPSB0b2tlbml6YXRpb25JbXBsT2JzLmdldCgpID8/IGF3YWl0IHdhaXRGb3JTdGF0ZSh0b2tlbml6YXRpb25JbXBsT2JzKTtcblxuXHRcdGFzc2VydC5vayh0cmVlU2l0dGVyVHJlZSk7XG5cdFx0cmV0dXJuIHsgbW9kZWwsIHRyZWVTaXR0ZXJUcmVlLCB0b2tlbml6YXRpb25JbXBsIH07XG5cdH1cblxuXHRmdW5jdGlvbiB2ZXJpZnlUb2tlbnModG9rZW5zOiBUb2tlblVwZGF0ZVtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0YXNzZXJ0Lm9rKHRva2Vucyk7XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHByZXZpb3VzVG9rZW46IFRva2VuVXBkYXRlID0gdG9rZW5zW2kgLSAxXTtcblx0XHRcdGNvbnN0IHRva2VuOiBUb2tlblVwZGF0ZSA9IHRva2Vuc1tpXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJldmlvdXNUb2tlbi5zdGFydE9mZnNldEluY2x1c2l2ZSArIHByZXZpb3VzVG9rZW4ubGVuZ3RoLCB0b2tlbi5zdGFydE9mZnNldEluY2x1c2l2ZSk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnVGhyZWUgY2hhbmdlcyBjb21lIGJhY2sgdG8gYmFjayAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGAvKipcbioqL1xuY2xhc3MgeCB7XG59XG5cblxuXG5cbmNsYXNzIHkge1xufWA7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdHJlZVNpdHRlclRyZWUgfSA9IGF3YWl0IGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudCk7XG5cblx0XHRsZXQgdXBkYXRlTGlzdGVuZXI6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNoYW5nZVByb21pc2UgPSBuZXcgUHJvbWlzZTxUcmVlUGFyc2VVcGRhdGVFdmVudCB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHR1cGRhdGVMaXN0ZW5lciA9IGF1dG9ydW5IYW5kbGVDaGFuZ2VzKHtcblx0XHRcdFx0b3duZXI6IHRoaXMsXG5cdFx0XHRcdGNoYW5nZVRyYWNrZXI6IHJlY29yZENoYW5nZXMoeyB0cmVlOiB0cmVlU2l0dGVyVHJlZS50cmVlIH0pLFxuXHRcdFx0fSwgKHJlYWRlciwgY3R4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZUV2ZW50ID0gY3R4LmNoYW5nZXMuYXQoMCk/LmNoYW5nZTtcblx0XHRcdFx0aWYgKGNoYW5nZUV2ZW50KSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShjaGFuZ2VFdmVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZWRpdDEgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZSg3LCAxLCA4LCAxKSwgdGV4dDogJycgfV0pO1xuXHRcdFx0cmVzb2x2ZSgpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGVkaXQyID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRtb2RlbC5hcHBseUVkaXRzKFt7IHJhbmdlOiBuZXcgUmFuZ2UoNiwgMSwgNywgMSksIHRleHQ6ICcnIH1dKTtcblx0XHRcdHJlc29sdmUoKTtcblx0XHR9KTtcblx0XHRjb25zdCBlZGl0MyA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbmV3IFJhbmdlKDUsIDEsIDYsIDEpLCB0ZXh0OiAnJyB9XSk7XG5cdFx0XHRyZXNvbHZlKCk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZWRpdHMgPSBQcm9taXNlLmFsbChbZWRpdDEsIGVkaXQyLCBlZGl0M10pO1xuXHRcdGNvbnN0IGNoYW5nZSA9IGF3YWl0IGNoYW5nZVByb21pc2U7XG5cdFx0YXdhaXQgZWRpdHM7XG5cdFx0YXNzZXJ0Lm9rKGNoYW5nZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlLnZlcnNpb25JZCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZS5yYW5nZXNbMF0ubmV3UmFuZ2VTdGFydE9mZnNldCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZS5yYW5nZXNbMF0ubmV3UmFuZ2VFbmRPZmZzZXQsIDMyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlLnJhbmdlc1swXS5uZXdSYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2UucmFuZ2VzWzBdLm5ld1JhbmdlLmVuZExpbmVOdW1iZXIsIDcpO1xuXG5cdFx0dXBkYXRlTGlzdGVuZXI/LmRpc3Bvc2UoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGUgc2luZ2xlIGxpbmUgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYGNvbnNvbGUubG9nKCd4Jyk7YDtcblx0XHRjb25zdCB7IG1vZGVsLCB0b2tlbml6YXRpb25JbXBsIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRva2VuaXphdGlvbkltcGwuZ2V0VG9rZW5zSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMTgpLCAwLCAxNyk7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgOSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnMpLCBjb250ZW50Lmxlbmd0aCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIHdpdGggbmV3IGxpbmVzIGF0IGJlZ2lubmluZyBhbmQgZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgXG5jb25zb2xlLmxvZygneCcpO1xuYDtcblx0XHRjb25zdCB7IG1vZGVsLCB0b2tlbml6YXRpb25JbXBsIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRva2VuaXphdGlvbkltcGwuZ2V0VG9rZW5zSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMywgMSksIDAsIDE5KTtcblx0XHR2ZXJpZnlUb2tlbnModG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vucz8ubGVuZ3RoLCAxMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnMpLCBjb250ZW50Lmxlbmd0aCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIHdpdGggbmV3IGxpbmVzIGF0IGJlZ2lubmluZyBhbmQgZW5kIFxcXFxyXFxcXG4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9ICdcXHJcXG5jb25zb2xlLmxvZyhcXCd4XFwnKTtcXHJcXG4nO1xuXHRcdGNvbnN0IHsgbW9kZWwsIHRva2VuaXphdGlvbkltcGwgfSA9IGF3YWl0IGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudCk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdG9rZW5pemF0aW9uSW1wbC5nZXRUb2tlbnNJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAzLCAxKSwgMCwgMjEpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDExKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vuc0NvbnRlbnRTaXplKHRva2VucyksIGNvbnRlbnQubGVuZ3RoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGUgd2l0aCBlbXB0eSBsaW5lcyBpbiB0aGUgbWlkZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgXG5jb25zb2xlLmxvZygneCcpO1xuXG5jb25zb2xlLmxvZygnNycpO1xuYDtcblx0XHRjb25zdCB7IG1vZGVsLCB0b2tlbml6YXRpb25JbXBsIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRva2VuaXphdGlvbkltcGwuZ2V0VG9rZW5zSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgNSwgMSksIDAsIDM4KTtcblx0XHR2ZXJpZnlUb2tlbnModG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vucz8ubGVuZ3RoLCAyMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnMpLCBjb250ZW50Lmxlbmd0aCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIHdpdGggZW1wdHkgbGluZXMgaW4gdGhlIG1pZGRsZSBcXFxcclxcXFxuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnXFxyXFxuY29uc29sZS5sb2coXFwneFxcJyk7XFxyXFxuXFxyXFxuY29uc29sZS5sb2coXFwnN1xcJyk7XFxyXFxuJztcblx0XHRjb25zdCB7IG1vZGVsLCB0b2tlbml6YXRpb25JbXBsIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRva2VuaXphdGlvbkltcGwuZ2V0VG9rZW5zSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgNSwgMSksIDAsIDQyKTtcblx0XHR2ZXJpZnlUb2tlbnModG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vucz8ubGVuZ3RoLCAyMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnMpLCBjb250ZW50Lmxlbmd0aCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIHdpdGggbm9uLWVtcHR5IGxpbmVzIHRoYXQgbWF0Y2ggbm8gc2NvcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgY29uc29sZS5sb2coJ3gnKTtcbjtcbntcbn1cbmA7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDUsIDEpLCAwLCAyNCk7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgMTYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIG5vbi1lbXB0eSBsaW5lcyB0aGF0IG1hdGNoIG5vIHNjb3BlcyBcXFxcclxcXFxuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnY29uc29sZS5sb2coXFwneFxcJyk7XFxyXFxuO1xcclxcbntcXHJcXG59XFxyXFxuJztcblx0XHRjb25zdCB7IG1vZGVsLCB0b2tlbml6YXRpb25JbXBsIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRva2VuaXphdGlvbkltcGwuZ2V0VG9rZW5zSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgNSwgMSksIDAsIDI4KTtcblx0XHR2ZXJpZnlUb2tlbnModG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vucz8ubGVuZ3RoLCAxNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnNDb250ZW50U2l6ZSh0b2tlbnMpLCBjb250ZW50Lmxlbmd0aCk7XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIHdpdGggdHJlZS1zaXR0ZXIgdG9rZW4gdGhhdCBzcGFucyBtdWx0aXBsZSBsaW5lcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYC8qKlxuKiovXG5cbmNvbnNvbGUubG9nKCd4Jyk7XG5cbmA7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDYsIDEpLCAwLCAyOCk7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgMTIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIHRyZWUtc2l0dGVyIHRva2VuIHRoYXQgc3BhbnMgbXVsdGlwbGUgbGluZXMgXFxcXHJcXFxcbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJy8qKlxcclxcbioqL1xcclxcblxcclxcbmNvbnNvbGUubG9nKFxcJ3hcXCcpO1xcclxcblxcclxcbic7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDYsIDEpLCAwLCAzMyk7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgMTIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIHRhYnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGBmdW5jdGlvbiB4KCkge1xuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuY2xhc3MgWSB7XG5cdHByaXZhdGUgeiA9IGZhbHNlO1xufWA7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDcsIDEpLCAwLCA2Myk7XG5cdFx0dmVyaWZ5VG9rZW5zKHRva2Vucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnM/Lmxlbmd0aCwgMzApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnRmlsZSB3aXRoIHRhYnMgXFxcXHJcXFxcbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ2Z1bmN0aW9uIHgoKSB7XFxyXFxuXFx0cmV0dXJuIHRydWU7XFxyXFxufVxcclxcblxcclxcbmNsYXNzIFkge1xcclxcblxcdHByaXZhdGUgeiA9IGZhbHNlO1xcclxcbn0nO1xuXHRcdGNvbnN0IHsgbW9kZWwsIHRva2VuaXphdGlvbkltcGwgfSA9IGF3YWl0IGdldE1vZGVsQW5kUHJlcFRyZWUoY29udGVudCk7XG5cdFx0Y29uc3QgdG9rZW5zID0gdG9rZW5pemF0aW9uSW1wbC5nZXRUb2tlbnNJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCA3LCAxKSwgMCwgNjkpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDMwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vuc0NvbnRlbnRTaXplKHRva2VucyksIGNvbnRlbnQubGVuZ3RoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RlbXBsYXRlIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gJ2B0ICR7Nn1gJztcblx0XHRjb25zdCB7IG1vZGVsLCB0b2tlbml6YXRpb25JbXBsIH0gPSBhd2FpdCBnZXRNb2RlbEFuZFByZXBUcmVlKGNvbnRlbnQpO1xuXHRcdGNvbnN0IHRva2VucyA9IHRva2VuaXphdGlvbkltcGwuZ2V0VG9rZW5zSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgOCksIDAsIDgpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDYpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zQ29udGVudFNpemUodG9rZW5zKSwgY29udGVudC5sZW5ndGgpO1xuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwobW9kZWwudXJpKTtcblx0fSk7XG5cblx0dGVzdCgnTWFueSBuZXN0ZWQgc2NvcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgeSA9IG5ldyB4KHR0dCh7XG5cdG1lc3NhZ2U6ICd7MH0gaVxcXFxuXFxcXG4gW2NvbW1hbmROYW1lXSh7MX0pLicsXG5cdGFyZ3M6IFsnVGVzdCcsIFxcYGNvbW1hbmQ6XFwke29wZW5TZXR0aW5nc0NvbW1hbmR9P1xcJHtlbmNvZGVVUklDb21wb25lbnQoJ1tcIlNldHRpbmdOYW1lXCJdJyl9XFxgXSxcblx0Ly8gVG8gbWFrZSBzdXJlIHRoZSB0cmFuc2xhdG9ycyBkb24ndCBicmVhayB0aGUgbGlua1xuXHRjb21tZW50OiBbXCJ7TG9ja2VkPSddKHsnfVwiXVxufSkpO2A7XG5cdFx0Y29uc3QgeyBtb2RlbCwgdG9rZW5pemF0aW9uSW1wbCB9ID0gYXdhaXQgZ2V0TW9kZWxBbmRQcmVwVHJlZShjb250ZW50KTtcblx0XHRjb25zdCB0b2tlbnMgPSB0b2tlbml6YXRpb25JbXBsLmdldFRva2Vuc0luUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDYsIDUpLCAwLCAyMzgpO1xuXHRcdHZlcmlmeVRva2Vucyh0b2tlbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zPy5sZW5ndGgsIDY1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2Vuc0NvbnRlbnRTaXplKHRva2VucyksIGNvbnRlbnQubGVuZ3RoKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKG1vZGVsLnVyaSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBeUIsbUJBQW1CLHNCQUFzQjtBQUVsRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0Isd0JBQXdCO0FBQ2pELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQW9DO0FBQzdDLFNBQXFCLGtCQUFrQjtBQUV2QyxTQUFTLGFBQWE7QUFD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
