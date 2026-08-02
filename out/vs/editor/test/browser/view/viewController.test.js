import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestThemeService } from "../../../../platform/theme/test/common/testThemeService.js";
import { NavigationCommandRevealType } from "../../../browser/coreCommands.js";
import { ViewController } from "../../../browser/view/viewController.js";
import { ViewUserInputEvents } from "../../../browser/view/viewUserInputEvents.js";
import { Position } from "../../../common/core/position.js";
import { MetadataConsts, StandardTokenType } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { MonospaceLineBreaksComputerFactory } from "../../../common/viewModel/monospaceLineBreaksComputer.js";
import { ViewModel } from "../../../common/viewModel/viewModelImpl.js";
import { instantiateTextModel } from "../../../test/common/testTextModel.js";
import { TestLanguageConfigurationService } from "../../common/modes/testLanguageConfigurationService.js";
import { TestConfiguration } from "../config/testConfiguration.js";
import { createCodeEditorServices } from "../testCodeEditor.js";
suite("ViewController - Bracket content selection", () => {
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  let viewModel;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createCodeEditorServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
    viewModel = void 0;
  });
  teardown(() => {
    viewModel?.dispose();
    viewModel = void 0;
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createViewControllerWithText(text) {
    const languageId = "testMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const configuration = disposables.add(new TestConfiguration({}));
    const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(configuration.options);
    viewModel = new ViewModel(
      1,
      // editorId
      configuration,
      disposables.add(instantiateTextModel(instantiationService, text, languageId)),
      monospaceLineBreaksComputerFactory,
      monospaceLineBreaksComputerFactory,
      null,
      disposables.add(new TestLanguageConfigurationService()),
      new TestThemeService(),
      { setVisibleLines() {
      } },
      { batchChanges: (cb) => cb() }
    );
    return new ViewController(
      configuration,
      viewModel,
      new ViewUserInputEvents(viewModel.coordinatesConverter),
      {
        paste: () => {
        },
        type: () => {
        },
        compositionType: () => {
        },
        startComposition: () => {
        },
        endComposition: () => {
        },
        cut: () => {
        }
      }
    );
  }
  function testBracketSelection(text, position, expectedText) {
    const controller = createViewControllerWithText(text);
    controller.dispatchMouse({
      position,
      mouseColumn: position.column,
      startedOnLineNumbers: false,
      revealType: NavigationCommandRevealType.Minimal,
      mouseDownCount: 2,
      inSelectionMode: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      leftButton: true,
      middleButton: false,
      onInjectedText: false
    });
    const selections = viewModel.getSelections();
    const selectedText = viewModel.model.getValueInRange(selections[0]);
    if (expectedText === void 0) {
      assert.notStrictEqual(selectedText, expectedText);
    } else {
      assert.strictEqual(selectedText, expectedText);
    }
  }
  test("Select content after opening curly brace", () => {
    testBracketSelection("var x = { hello };", new Position(1, 10), " hello ");
  });
  test("Select content before closing curly brace", () => {
    testBracketSelection("var x = { hello };", new Position(1, 17), " hello ");
  });
  test("Select content after opening parenthesis", () => {
    testBracketSelection("function foo(arg1, arg2) {}", new Position(1, 14), "arg1, arg2");
  });
  test("Select content before closing parenthesis", () => {
    testBracketSelection("function foo(arg1, arg2) {}", new Position(1, 24), "arg1, arg2");
  });
  test("Select content after opening square bracket", () => {
    testBracketSelection("const arr = [ 1, 2, 3 ];", new Position(1, 14), " 1, 2, 3 ");
  });
  test("Select content before closing square bracket", () => {
    testBracketSelection("const arr = [ 1, 2, 3 ];", new Position(1, 23), " 1, 2, 3 ");
  });
  test("Select innermost bracket content with nested brackets", () => {
    testBracketSelection("var x = { a: { b: 123 }};", new Position(1, 15), " b: 123 ");
  });
  test("Empty brackets create empty selection", () => {
    testBracketSelection("var x = {};", new Position(1, 10), "");
  });
});
suite("ViewController - String content selection", () => {
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  let viewModel;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createCodeEditorServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
    viewModel = void 0;
  });
  teardown(() => {
    viewModel?.dispose();
    viewModel = void 0;
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createViewControllerWithTokens(text, lineTokens) {
    const languageId = "stringTestMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
    const makeMetadata = (type) => (encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | type << MetadataConsts.TOKEN_TYPE_OFFSET) >>> 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (_line, _hasEOL, state) => {
        const arr = new Uint32Array(lineTokens.length * 2);
        for (let i = 0; i < lineTokens.length; i++) {
          arr[i * 2] = lineTokens[i].startIndex;
          arr[i * 2 + 1] = makeMetadata(lineTokens[i].type);
        }
        return new EncodedTokenizationResult(arr, [], state);
      }
    };
    disposables.add(TokenizationRegistry.register(languageId, tokenizationSupport));
    const configuration = disposables.add(new TestConfiguration({}));
    const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(configuration.options);
    const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
    model.tokenization.forceTokenization(1);
    viewModel = new ViewModel(
      1,
      configuration,
      model,
      monospaceLineBreaksComputerFactory,
      monospaceLineBreaksComputerFactory,
      null,
      disposables.add(new TestLanguageConfigurationService()),
      new TestThemeService(),
      { setVisibleLines() {
      } },
      { batchChanges: (cb) => cb() }
    );
    return new ViewController(
      configuration,
      viewModel,
      new ViewUserInputEvents(viewModel.coordinatesConverter),
      {
        paste: () => {
        },
        type: () => {
        },
        compositionType: () => {
        },
        startComposition: () => {
        },
        endComposition: () => {
        },
        cut: () => {
        }
      }
    );
  }
  function doubleClickAt(controller, position) {
    controller.dispatchMouse({
      position,
      mouseColumn: position.column,
      startedOnLineNumbers: false,
      revealType: NavigationCommandRevealType.Minimal,
      mouseDownCount: 2,
      inSelectionMode: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      leftButton: true,
      middleButton: false,
      onInjectedText: false
    });
    const selections = viewModel.getSelections();
    return viewModel.model.getValueInRange(selections[0]);
  }
  test("Select string content clicking right after opening double quote", () => {
    const text = 'var x = "hello";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 15, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "hello");
  });
  test("Select string content clicking at closing double quote", () => {
    const text = 'var x = "hello";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 15, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 15)), "hello");
  });
  test("Select string content with single quotes", () => {
    const text = `var x = 'hello';`;
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 15, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "hello");
  });
  test("Select string content with backtick quotes", () => {
    const text = "var x = `hello`;";
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 15, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "hello");
  });
  test("Select string content containing escape characters", () => {
    const text = 'var x = "hello\\"world";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 9, type: StandardTokenType.String },
      { startIndex: 14, type: StandardTokenType.String },
      { startIndex: 16, type: StandardTokenType.String },
      { startIndex: 21, type: StandardTokenType.String },
      { startIndex: 22, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello\\"world');
  });
  test("Click in middle of string does not select whole string", () => {
    const text = 'var x = "hello world";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 21, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 16)), "world");
  });
  test("Separate quote tokens fall back to word select", () => {
    const text = 'var x = "hello world";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.Other },
      // opening "
      { startIndex: 9, type: StandardTokenType.String },
      // hello world
      { startIndex: 20, type: StandardTokenType.Other },
      // closing "
      { startIndex: 21, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "hello");
  });
  test("RTL content in string falls back to word select", () => {
    const text = 'var x = "\u05E9\u05DC\u05D5\u05DD \u05E2\u05D5\u05DC\u05DD";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 19, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "\u05E9\u05DC\u05D5\u05DD");
  });
  test("String token without matching closing quote falls back to word select", () => {
    const text = 'var x = "a {} b";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      // `"a ` — starts with " but doesn't end with "
      { startIndex: 11, type: StandardTokenType.Other },
      // `{}`
      { startIndex: 13, type: StandardTokenType.String },
      // ` b"` — ends with " but doesn't start with "
      { startIndex: 16, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "a");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvdmlldy92aWV3Q29udHJvbGxlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZpZXcvdmlld0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgVmlld1VzZXJJbnB1dEV2ZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdmlldy92aWV3VXNlcklucHV0RXZlbnRzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMsIFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCwgSVRva2VuaXphdGlvblN1cHBvcnQsIFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgTW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvbW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyLmpzJztcbmltcG9ydCB7IFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld01vZGVsSW1wbC5qcyc7XG5pbXBvcnQgeyBpbnN0YW50aWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZXMvdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb25maWcvdGVzdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29kZUVkaXRvclNlcnZpY2VzIH0gZnJvbSAnLi4vdGVzdENvZGVFZGl0b3IuanMnO1xuXG5zdWl0ZSgnVmlld0NvbnRyb2xsZXIgLSBCcmFja2V0IGNvbnRlbnQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblx0bGV0IHZpZXdNb2RlbDogVmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0bGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdHZpZXdNb2RlbCA9IHVuZGVmaW5lZDtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHZpZXdNb2RlbD8uZGlzcG9zZSgpO1xuXHRcdHZpZXdNb2RlbCA9IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVZpZXdDb250cm9sbGVyV2l0aFRleHQodGV4dDogc3RyaW5nKTogVmlld0NvbnRyb2xsZXIge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAndGVzdE1vZGUnO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRicmFja2V0czogW1xuXHRcdFx0XHRbJ3snLCAnfSddLFxuXHRcdFx0XHRbJ1snLCAnXSddLFxuXHRcdFx0XHRbJygnLCAnKSddLFxuXHRcdFx0XVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RDb25maWd1cmF0aW9uKHt9KSk7XG5cdFx0Y29uc3QgbW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSA9IE1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkuY3JlYXRlKGNvbmZpZ3VyYXRpb24ub3B0aW9ucyk7XG5cblx0XHR2aWV3TW9kZWwgPSBuZXcgVmlld01vZGVsKFxuXHRcdFx0MSwgLy8gZWRpdG9ySWRcblx0XHRcdGNvbmZpZ3VyYXRpb24sXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRleHQsIGxhbmd1YWdlSWQpKSxcblx0XHRcdG1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0XHRtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdFx0bnVsbCEsXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IFRlc3RUaGVtZVNlcnZpY2UoKSxcblx0XHRcdHsgc2V0VmlzaWJsZUxpbmVzKCkgeyB9IH0sXG5cdFx0XHR7IGJhdGNoQ2hhbmdlczogKGNiOiBhbnkpID0+IGNiKCkgfVxuXHRcdCk7XG5cblx0XHRyZXR1cm4gbmV3IFZpZXdDb250cm9sbGVyKFxuXHRcdFx0Y29uZmlndXJhdGlvbixcblx0XHRcdHZpZXdNb2RlbCxcblx0XHRcdG5ldyBWaWV3VXNlcklucHV0RXZlbnRzKHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlciksXG5cdFx0XHR7XG5cdFx0XHRcdHBhc3RlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHR5cGU6ICgpID0+IHsgfSxcblx0XHRcdFx0Y29tcG9zaXRpb25UeXBlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHN0YXJ0Q29tcG9zaXRpb246ICgpID0+IHsgfSxcblx0XHRcdFx0ZW5kQ29tcG9zaXRpb246ICgpID0+IHsgfSxcblx0XHRcdFx0Y3V0OiAoKSA9PiB7IH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gdGVzdEJyYWNrZXRTZWxlY3Rpb24odGV4dDogc3RyaW5nLCBwb3NpdGlvbjogUG9zaXRpb24sIGV4cGVjdGVkVGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVZpZXdDb250cm9sbGVyV2l0aFRleHQodGV4dCk7XG5cdFx0Y29udHJvbGxlci5kaXNwYXRjaE1vdXNlKHtcblx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0bW91c2VDb2x1bW46IHBvc2l0aW9uLmNvbHVtbixcblx0XHRcdHN0YXJ0ZWRPbkxpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdHJldmVhbFR5cGU6IE5hdmlnYXRpb25Db21tYW5kUmV2ZWFsVHlwZS5NaW5pbWFsLFxuXHRcdFx0bW91c2VEb3duQ291bnQ6IDIsXG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRsZWZ0QnV0dG9uOiB0cnVlLFxuXHRcdFx0bWlkZGxlQnV0dG9uOiBmYWxzZSxcblx0XHRcdG9uSW5qZWN0ZWRUZXh0OiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHZpZXdNb2RlbCEuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGNvbnN0IHNlbGVjdGVkVGV4dCA9IHZpZXdNb2RlbCEubW9kZWwuZ2V0VmFsdWVJblJhbmdlKHNlbGVjdGlvbnNbMF0pO1xuXHRcdGlmIChleHBlY3RlZFRleHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNlbGVjdGVkVGV4dCwgZXhwZWN0ZWRUZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbGVjdGVkVGV4dCwgZXhwZWN0ZWRUZXh0KTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdTZWxlY3QgY29udGVudCBhZnRlciBvcGVuaW5nIGN1cmx5IGJyYWNlJywgKCkgPT4ge1xuXHRcdHRlc3RCcmFja2V0U2VsZWN0aW9uKCd2YXIgeCA9IHsgaGVsbG8gfTsnLCBuZXcgUG9zaXRpb24oMSwgMTApLCAnIGhlbGxvICcpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWxlY3QgY29udGVudCBiZWZvcmUgY2xvc2luZyBjdXJseSBicmFjZScsICgpID0+IHtcblx0XHR0ZXN0QnJhY2tldFNlbGVjdGlvbigndmFyIHggPSB7IGhlbGxvIH07JywgbmV3IFBvc2l0aW9uKDEsIDE3KSwgJyBoZWxsbyAnKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IGNvbnRlbnQgYWZ0ZXIgb3BlbmluZyBwYXJlbnRoZXNpcycsICgpID0+IHtcblx0XHR0ZXN0QnJhY2tldFNlbGVjdGlvbignZnVuY3Rpb24gZm9vKGFyZzEsIGFyZzIpIHt9JywgbmV3IFBvc2l0aW9uKDEsIDE0KSwgJ2FyZzEsIGFyZzInKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IGNvbnRlbnQgYmVmb3JlIGNsb3NpbmcgcGFyZW50aGVzaXMnLCAoKSA9PiB7XG5cdFx0dGVzdEJyYWNrZXRTZWxlY3Rpb24oJ2Z1bmN0aW9uIGZvbyhhcmcxLCBhcmcyKSB7fScsIG5ldyBQb3NpdGlvbigxLCAyNCksICdhcmcxLCBhcmcyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlbGVjdCBjb250ZW50IGFmdGVyIG9wZW5pbmcgc3F1YXJlIGJyYWNrZXQnLCAoKSA9PiB7XG5cdFx0dGVzdEJyYWNrZXRTZWxlY3Rpb24oJ2NvbnN0IGFyciA9IFsgMSwgMiwgMyBdOycsIG5ldyBQb3NpdGlvbigxLCAxNCksICcgMSwgMiwgMyAnKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IGNvbnRlbnQgYmVmb3JlIGNsb3Npbmcgc3F1YXJlIGJyYWNrZXQnLCAoKSA9PiB7XG5cdFx0dGVzdEJyYWNrZXRTZWxlY3Rpb24oJ2NvbnN0IGFyciA9IFsgMSwgMiwgMyBdOycsIG5ldyBQb3NpdGlvbigxLCAyMyksICcgMSwgMiwgMyAnKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IGlubmVybW9zdCBicmFja2V0IGNvbnRlbnQgd2l0aCBuZXN0ZWQgYnJhY2tldHMnLCAoKSA9PiB7XG5cdFx0dGVzdEJyYWNrZXRTZWxlY3Rpb24oJ3ZhciB4ID0geyBhOiB7IGI6IDEyMyB9fTsnLCBuZXcgUG9zaXRpb24oMSwgMTUpLCAnIGI6IDEyMyAnKTtcblx0fSk7XG5cblx0dGVzdCgnRW1wdHkgYnJhY2tldHMgY3JlYXRlIGVtcHR5IHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0QnJhY2tldFNlbGVjdGlvbigndmFyIHggPSB7fTsnLCBuZXcgUG9zaXRpb24oMSwgMTApLCAnJyk7XG5cdH0pO1xufSk7XG5cbmludGVyZmFjZSBUb2tlblNwYW4ge1xuXHRzdGFydEluZGV4OiBudW1iZXI7XG5cdHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlO1xufVxuXG5zdWl0ZSgnVmlld0NvbnRyb2xsZXIgLSBTdHJpbmcgY29udGVudCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXHRsZXQgdmlld01vZGVsOiBWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlQ29kZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0dmlld01vZGVsID0gdW5kZWZpbmVkO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0dmlld01vZGVsPy5kaXNwb3NlKCk7XG5cdFx0dmlld01vZGVsID0gdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQ6IHN0cmluZywgbGluZVRva2VuczogVG9rZW5TcGFuW10pOiBWaWV3Q29udHJvbGxlciB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdzdHJpbmdUZXN0TW9kZSc7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRcdFsnWycsICddJ10sXG5cdFx0XHRcdFsnKCcsICcpJ10sXG5cdFx0XHRdXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdFx0Y29uc3QgbWFrZU1ldGFkYXRhID0gKHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlKSA9PiAoXG5cdFx0XHQoZW5jb2RlZExhbmd1YWdlSWQgPDwgTWV0YWRhdGFDb25zdHMuTEFOR1VBR0VJRF9PRkZTRVQpXG5cdFx0XHR8ICh0eXBlIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKVxuXHRcdCkgPj4+IDA7XG5cblx0XHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0OiBJVG9rZW5pemF0aW9uU3VwcG9ydCA9IHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdFx0dG9rZW5pemU6IHVuZGVmaW5lZCEsXG5cdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChfbGluZSwgX2hhc0VPTCwgc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgYXJyID0gbmV3IFVpbnQzMkFycmF5KGxpbmVUb2tlbnMubGVuZ3RoICogMik7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZVRva2Vucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGFycltpICogMl0gPSBsaW5lVG9rZW5zW2ldLnN0YXJ0SW5kZXg7XG5cdFx0XHRcdFx0YXJyW2kgKiAyICsgMV0gPSBtYWtlTWV0YWRhdGEobGluZVRva2Vuc1tpXS50eXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQoYXJyLCBbXSwgc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIobGFuZ3VhZ2VJZCwgdG9rZW5pemF0aW9uU3VwcG9ydCkpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENvbmZpZ3VyYXRpb24oe30pKTtcblx0XHRjb25zdCBtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5ID0gTW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeS5jcmVhdGUoY29uZmlndXJhdGlvbi5vcHRpb25zKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgdGV4dCwgbGFuZ3VhZ2VJZCkpO1xuXG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDEpO1xuXG5cdFx0dmlld01vZGVsID0gbmV3IFZpZXdNb2RlbChcblx0XHRcdDEsXG5cdFx0XHRjb25maWd1cmF0aW9uLFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdFx0bW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSxcblx0XHRcdG51bGwhLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSxcblx0XHRcdG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCksXG5cdFx0XHR7IHNldFZpc2libGVMaW5lcygpIHsgfSB9LFxuXHRcdFx0eyBiYXRjaENoYW5nZXM6IChjYjogYW55KSA9PiBjYigpIH1cblx0XHQpO1xuXG5cdFx0cmV0dXJuIG5ldyBWaWV3Q29udHJvbGxlcihcblx0XHRcdGNvbmZpZ3VyYXRpb24sXG5cdFx0XHR2aWV3TW9kZWwsXG5cdFx0XHRuZXcgVmlld1VzZXJJbnB1dEV2ZW50cyh2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIpLFxuXHRcdFx0e1xuXHRcdFx0XHRwYXN0ZTogKCkgPT4geyB9LFxuXHRcdFx0XHR0eXBlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGNvbXBvc2l0aW9uVHlwZTogKCkgPT4geyB9LFxuXHRcdFx0XHRzdGFydENvbXBvc2l0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGVuZENvbXBvc2l0aW9uOiAoKSA9PiB7IH0sXG5cdFx0XHRcdGN1dDogKCkgPT4geyB9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGRvdWJsZUNsaWNrQXQoY29udHJvbGxlcjogVmlld0NvbnRyb2xsZXIsIHBvc2l0aW9uOiBQb3NpdGlvbik6IHN0cmluZyB7XG5cdFx0Y29udHJvbGxlci5kaXNwYXRjaE1vdXNlKHtcblx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0bW91c2VDb2x1bW46IHBvc2l0aW9uLmNvbHVtbixcblx0XHRcdHN0YXJ0ZWRPbkxpbmVOdW1iZXJzOiBmYWxzZSxcblx0XHRcdHJldmVhbFR5cGU6IE5hdmlnYXRpb25Db21tYW5kUmV2ZWFsVHlwZS5NaW5pbWFsLFxuXHRcdFx0bW91c2VEb3duQ291bnQ6IDIsXG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdFx0YWx0S2V5OiBmYWxzZSxcblx0XHRcdGN0cmxLZXk6IGZhbHNlLFxuXHRcdFx0bWV0YUtleTogZmFsc2UsXG5cdFx0XHRzaGlmdEtleTogZmFsc2UsXG5cdFx0XHRsZWZ0QnV0dG9uOiB0cnVlLFxuXHRcdFx0bWlkZGxlQnV0dG9uOiBmYWxzZSxcblx0XHRcdG9uSW5qZWN0ZWRUZXh0OiBmYWxzZVxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB2aWV3TW9kZWwhLmdldFNlbGVjdGlvbnMoKTtcblx0XHRyZXR1cm4gdmlld01vZGVsIS5tb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uc1swXSk7XG5cdH1cblxuXHQvLyAtLSBIYXBweS1wYXRoOiB3aG9sZSBzdHJpbmcgYXMgYSBzaW5nbGUgdG9rZW4gaW5jbHVkaW5nIHF1b3RlcyAtLVxuXG5cdHRlc3QoJ1NlbGVjdCBzdHJpbmcgY29udGVudCBjbGlja2luZyByaWdodCBhZnRlciBvcGVuaW5nIGRvdWJsZSBxdW90ZScsICgpID0+IHtcblx0XHQvLyAgICAgICAgICAgICAgICAwMTIzNDU2Nzg5Li4uXG5cdFx0Y29uc3QgdGV4dCA9ICd2YXIgeCA9IFwiaGVsbG9cIjsnO1xuXHRcdC8vIFRva2VuIGxheW91dDogWzAuLjgpIE90aGVyICBbOC4uMTUpIFN0cmluZyhcImhlbGxvXCIpICBbMTUuLjE2KSBPdGhlclxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVWaWV3Q29udHJvbGxlcldpdGhUb2tlbnModGV4dCwgW1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA4LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTUsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XSk7XG5cdFx0Ly8gQ29sdW1uIHJpZ2h0IGFmdGVyIG9wZW5pbmcgcXVvdGU6IG9mZnNldCA5IFx1MjE5MiBjb2x1bW4gMTBcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG91YmxlQ2xpY2tBdChjb250cm9sbGVyLCBuZXcgUG9zaXRpb24oMSwgMTApKSwgJ2hlbGxvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlbGVjdCBzdHJpbmcgY29udGVudCBjbGlja2luZyBhdCBjbG9zaW5nIGRvdWJsZSBxdW90ZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gJ3ZhciB4ID0gXCJoZWxsb1wiOyc7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVZpZXdDb250cm9sbGVyV2l0aFRva2Vucyh0ZXh0LCBbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDgsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxNSwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRdKTtcblx0XHQvLyBDb2x1bW4gYXQgY2xvc2luZyBxdW90ZTogb2Zmc2V0IDE0IFx1MjE5MiBjb2x1bW4gMTVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG91YmxlQ2xpY2tBdChjb250cm9sbGVyLCBuZXcgUG9zaXRpb24oMSwgMTUpKSwgJ2hlbGxvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlbGVjdCBzdHJpbmcgY29udGVudCB3aXRoIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IGB2YXIgeCA9ICdoZWxsbyc7YDtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQsIFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDE1LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3VibGVDbGlja0F0KGNvbnRyb2xsZXIsIG5ldyBQb3NpdGlvbigxLCAxMCkpLCAnaGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IHN0cmluZyBjb250ZW50IHdpdGggYmFja3RpY2sgcXVvdGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAndmFyIHggPSBgaGVsbG9gOyc7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVZpZXdDb250cm9sbGVyV2l0aFRva2Vucyh0ZXh0LCBbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDgsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxNSwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG91YmxlQ2xpY2tBdChjb250cm9sbGVyLCBuZXcgUG9zaXRpb24oMSwgMTApKSwgJ2hlbGxvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlbGVjdCBzdHJpbmcgY29udGVudCBjb250YWluaW5nIGVzY2FwZSBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdC8vICAgICAgICAgICAgICAgIDAxMjM0NTY3ODkuLi5cblx0XHRjb25zdCB0ZXh0ID0gJ3ZhciB4ID0gXCJoZWxsb1xcXFxcIndvcmxkXCI7Jztcblx0XHQvLyBUb2tlbiBsYXlvdXQ6IFswLi44KSBPdGhlciAgWzguLjIyKSBTdHJpbmcoXCJoZWxsb1xcXCJ3b3JsZFwiKSAgWzIyLi4yMykgT3RoZXJcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQsIFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDksIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxNCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDE2LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMjEsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAyMiwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRdKTtcblx0XHQvLyBDb2x1bW4gcmlnaHQgYWZ0ZXIgb3BlbmluZyBxdW90ZTogb2Zmc2V0IDkgXHUyMTkyIGNvbHVtbiAxMFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3VibGVDbGlja0F0KGNvbnRyb2xsZXIsIG5ldyBQb3NpdGlvbigxLCAxMCkpLCAnaGVsbG9cXFxcXCJ3b3JsZCcpO1xuXHR9KTtcblxuXHQvLyAtLSBDbGljayBpbiBtaWRkbGUgb2Ygc3RyaW5nIHNob3VsZCBOT1Qgc2VsZWN0IHRoZSB3aG9sZSBzdHJpbmcgLS1cblxuXHR0ZXN0KCdDbGljayBpbiBtaWRkbGUgb2Ygc3RyaW5nIGRvZXMgbm90IHNlbGVjdCB3aG9sZSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0Ly8gICAgICAgICAgICAgICAgMDEyMzQ1Njc4OTAxMjM0NTY3ODkwMVxuXHRcdGNvbnN0IHRleHQgPSAndmFyIHggPSBcImhlbGxvIHdvcmxkXCI7Jztcblx0XHQvLyBUb2tlbiBsYXlvdXQ6IFswLi44KSBPdGhlciAgWzguLjIxKSBTdHJpbmcoXCJoZWxsbyB3b3JsZFwiKSAgWzIxLi4yMikgT3RoZXJcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQsIFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDIxLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdF0pO1xuXHRcdC8vIENsaWNrIG9uICd3JyBpbiBcIndvcmxkXCIgXHUyMDE0IHdvcmQgc2VsZWN0IHNob3VsZCBwaWNrICd3b3JsZCcsIG5vdCAnaGVsbG8gd29ybGQnXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvdWJsZUNsaWNrQXQoY29udHJvbGxlciwgbmV3IFBvc2l0aW9uKDEsIDE2KSksICd3b3JsZCcpO1xuXHR9KTtcblxuXHQvLyAtLSBCYWlsLW91dDogcXVvdGVzIGFzIHNlcGFyYXRlIHRva2VucyAodGhlbWUgaXNzdWUgIzI5Mjc4NCkgLS1cblxuXHR0ZXN0KCdTZXBhcmF0ZSBxdW90ZSB0b2tlbnMgZmFsbCBiYWNrIHRvIHdvcmQgc2VsZWN0JywgKCkgPT4ge1xuXHRcdC8vICAgICAgICAgICAgICAgIDAgICAgICAgICAxICAgICAgICAgMlxuXHRcdC8vICAgICAgICAgICAgICAgIDAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzRcblx0XHRjb25zdCB0ZXh0ID0gJ3ZhciB4ID0gXCJoZWxsbyB3b3JsZFwiOyc7XG5cdFx0Ly8gVGhlbWUgdG9rZW5pemVzIHF1b3RlcyBhcyBzZXBhcmF0ZSBPdGhlciB0b2tlbnM6XG5cdFx0Ly8gWzAuLjgpIE90aGVyICBbOC4uOSkgT3RoZXIoXCIpICBbOS4uMjApIFN0cmluZyhoZWxsbyB3b3JsZCkgIFsyMC4uMjEpIE90aGVyKFwiKSAgWzIxLi4yMikgT3RoZXJcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQsIFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSwgICAvLyBvcGVuaW5nIFwiXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDksIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LCAgLy8gaGVsbG8gd29ybGRcblx0XHRcdHsgc3RhcnRJbmRleDogMjAsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sICAvLyBjbG9zaW5nIFwiXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDIxLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdF0pO1xuXHRcdC8vIFRoZSBTdHJpbmcgdG9rZW4gXCJoZWxsbyB3b3JsZFwiIGRvZXNuJ3Qgc3RhcnQgd2l0aCBhIHF1b3RlIGNoYXIgXHUyMTkyIHNob3VsZCBiYWlsIG91dC5cblx0XHQvLyBDbGljayByaWdodCBhZnRlciBvcGVuaW5nIHF1b3RlIChjb2x1bW4gMTApIFx1MjE5MiB3b3JkIHNlbGVjdCBwaWNrcyBqdXN0ICdoZWxsbycuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvdWJsZUNsaWNrQXQoY29udHJvbGxlciwgbmV3IFBvc2l0aW9uKDEsIDEwKSksICdoZWxsbycpO1xuXHR9KTtcblxuXHQvLyAtLSBCYWlsLW91dDogUlRMIGNvbnRlbnQgaW4gc3RyaW5nICgjMjkzMzg0KSAtLVxuXG5cdHRlc3QoJ1JUTCBjb250ZW50IGluIHN0cmluZyBmYWxscyBiYWNrIHRvIHdvcmQgc2VsZWN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAndmFyIHggPSBcIlx1MDVFOVx1MDVEQ1x1MDVENVx1MDVERCBcdTA1RTJcdTA1RDVcdTA1RENcdTA1RERcIjsnO1xuXHRcdC8vIFRva2VuIGxheW91dDogWzAuLjgpIE90aGVyICBbOC4uMTkpIFN0cmluZyhcIlx1MDVFOVx1MDVEQ1x1MDVENVx1MDVERCBcdTA1RTJcdTA1RDVcdTA1RENcdTA1RERcIikgIFsxOS4uMjApIE90aGVyXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVZpZXdDb250cm9sbGVyV2l0aFRva2Vucyh0ZXh0LCBbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDgsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxOSwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRdKTtcblx0XHQvLyBTaG91bGQgYmFpbCBvdXQgZHVlIHRvIFJUTCBjb250ZW50IFx1MjE5MiB3b3JkIHNlbGVjdCBwaWNrcyBmaXJzdCB3b3JkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvdWJsZUNsaWNrQXQoY29udHJvbGxlciwgbmV3IFBvc2l0aW9uKDEsIDEwKSksICdcdTA1RTlcdTA1RENcdTA1RDVcdTA1REQnKTtcblx0fSk7XG5cblx0Ly8gLS0gQmFpbC1vdXQ6IG1pc21hdGNoZWQgcXVvdGVzICgjMjkzMjAzIFx1MjAxNCBzdHJpbmcgc3BsaXQgYXQgYnJhY2VzKSAtLVxuXG5cdHRlc3QoJ1N0cmluZyB0b2tlbiB3aXRob3V0IG1hdGNoaW5nIGNsb3NpbmcgcXVvdGUgZmFsbHMgYmFjayB0byB3b3JkIHNlbGVjdCcsICgpID0+IHtcblx0XHQvLyAgICAgICAgICAgICAgICAwMTIzNDU2Nzg5MDEyMzQ1XG5cdFx0Y29uc3QgdGV4dCA9ICd2YXIgeCA9IFwiYSB7fSBiXCI7Jztcblx0XHQvLyBIeXBvdGhldGljYWwgdG9rZW5pemVyIHNwbGl0czogWzAuLjgpIE90aGVyICBbOC4uMTEpIFN0cmluZyhcImEgKSAgWzExLi4xMykgT3RoZXIoe30pICBbMTMuLjE3KSBTdHJpbmcoIGJcIikgIFsxNy4uMTgpIE90aGVyXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVZpZXdDb250cm9sbGVyV2l0aFRva2Vucyh0ZXh0LCBbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDgsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LCAgLy8gYFwiYSBgIFx1MjAxNCBzdGFydHMgd2l0aCBcIiBidXQgZG9lc24ndCBlbmQgd2l0aCBcIlxuXHRcdFx0eyBzdGFydEluZGV4OiAxMSwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSwgIC8vIGB7fWBcblx0XHRcdHsgc3RhcnRJbmRleDogMTMsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LCAvLyBgIGJcImAgXHUyMDE0IGVuZHMgd2l0aCBcIiBidXQgZG9lc24ndCBzdGFydCB3aXRoIFwiXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDE2LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdF0pO1xuXHRcdC8vIEZpcnN0IFN0cmluZyB0b2tlbiBzdGFydHMgd2l0aCBcIiBidXQgZW5kcyB3aXRoIHNwYWNlIFx1MjE5MiBiYWlsIG91dCBcdTIxOTIgd29yZCBzZWxlY3QgcGlja3MgJ2EnXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvdWJsZUNsaWNrQXQoY29udHJvbGxlciwgbmV3IFBvc2l0aW9uKDEsIDEwKSksICdhJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMs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
