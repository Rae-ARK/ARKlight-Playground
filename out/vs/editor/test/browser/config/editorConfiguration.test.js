import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { migrateOptions } from "../../../browser/config/migrateOptions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EditorZoom } from "../../../common/config/editorZoom.js";
import { TestConfiguration } from "./testConfiguration.js";
import { AccessibilitySupport } from "../../../../platform/accessibility/common/accessibility.js";
suite("Common Editor Config", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Zoom Level", () => {
    const zoom = EditorZoom;
    zoom.setZoomLevel(0);
    assert.strictEqual(zoom.getZoomLevel(), 0);
    zoom.setZoomLevel(-0);
    assert.strictEqual(zoom.getZoomLevel(), 0);
    zoom.setZoomLevel(5);
    assert.strictEqual(zoom.getZoomLevel(), 5);
    zoom.setZoomLevel(-1);
    assert.strictEqual(zoom.getZoomLevel(), -1);
    zoom.setZoomLevel(9);
    assert.strictEqual(zoom.getZoomLevel(), 9);
    zoom.setZoomLevel(-9);
    assert.strictEqual(zoom.getZoomLevel(), -5);
    zoom.setZoomLevel(20);
    assert.strictEqual(zoom.getZoomLevel(), 20);
    zoom.setZoomLevel(-10);
    assert.strictEqual(zoom.getZoomLevel(), -5);
    zoom.setZoomLevel(9.1);
    assert.strictEqual(zoom.getZoomLevel(), 9.1);
    zoom.setZoomLevel(-9.1);
    assert.strictEqual(zoom.getZoomLevel(), -5);
    zoom.setZoomLevel(Infinity);
    assert.strictEqual(zoom.getZoomLevel(), 20);
    zoom.setZoomLevel(Number.NEGATIVE_INFINITY);
    assert.strictEqual(zoom.getZoomLevel(), -5);
  });
  class TestWrappingConfiguration extends TestConfiguration {
    _readEnvConfiguration() {
      return {
        extraEditorClassName: "",
        outerWidth: 1e3,
        outerHeight: 100,
        emptySelectionClipboard: true,
        pixelRatio: 1,
        accessibilitySupport: AccessibilitySupport.Unknown,
        editContextSupported: true
      };
    }
  }
  function assertWrapping(config, isViewportWrapping, wrappingColumn) {
    const options = config.options;
    const wrappingInfo = options.get(EditorOption.wrappingInfo);
    assert.strictEqual(wrappingInfo.isViewportWrapping, isViewportWrapping);
    assert.strictEqual(wrappingInfo.wrappingColumn, wrappingColumn);
  }
  test("wordWrap default", () => {
    const config = new TestWrappingConfiguration({});
    assertWrapping(config, false, -1);
    config.dispose();
  });
  test("wordWrap compat false", () => {
    const config = new TestWrappingConfiguration({
      // eslint-disable-next-line local/code-no-any-casts
      wordWrap: false
    });
    assertWrapping(config, false, -1);
    config.dispose();
  });
  test("wordWrap compat true", () => {
    const config = new TestWrappingConfiguration({
      // eslint-disable-next-line local/code-no-any-casts
      wordWrap: true
    });
    assertWrapping(config, true, 80);
    config.dispose();
  });
  test("wordWrap on", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "on"
    });
    assertWrapping(config, true, 80);
    config.dispose();
  });
  test("wordWrap on without minimap", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "on",
      minimap: {
        enabled: false
      }
    });
    assertWrapping(config, true, 88);
    config.dispose();
  });
  test("wordWrap on does not use wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "on",
      wordWrapColumn: 10
    });
    assertWrapping(config, true, 80);
    config.dispose();
  });
  test("wordWrap off", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "off"
    });
    assertWrapping(config, false, -1);
    config.dispose();
  });
  test("wordWrap off does not use wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "off",
      wordWrapColumn: 10
    });
    assertWrapping(config, false, -1);
    config.dispose();
  });
  test("wordWrap wordWrapColumn uses default wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "wordWrapColumn"
    });
    assertWrapping(config, false, 80);
    config.dispose();
  });
  test("wordWrap wordWrapColumn uses wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "wordWrapColumn",
      wordWrapColumn: 100
    });
    assertWrapping(config, false, 100);
    config.dispose();
  });
  test("wordWrap wordWrapColumn validates wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "wordWrapColumn",
      wordWrapColumn: -1
    });
    assertWrapping(config, false, 1);
    config.dispose();
  });
  test("wordWrap bounded uses default wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "bounded"
    });
    assertWrapping(config, true, 80);
    config.dispose();
  });
  test("wordWrap bounded uses wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "bounded",
      wordWrapColumn: 40
    });
    assertWrapping(config, true, 40);
    config.dispose();
  });
  test("wordWrap bounded validates wordWrapColumn", () => {
    const config = new TestWrappingConfiguration({
      wordWrap: "bounded",
      wordWrapColumn: -1
    });
    assertWrapping(config, true, 1);
    config.dispose();
  });
  test("issue #53152: Cannot assign to read only property 'enabled' of object", () => {
    const hoverOptions = {};
    Object.defineProperty(hoverOptions, "enabled", {
      writable: false,
      value: "on"
    });
    const config = new TestConfiguration({ hover: hoverOptions });
    assert.strictEqual(config.options.get(EditorOption.hover).enabled, "on");
    config.updateOptions({ hover: { enabled: "off" } });
    assert.strictEqual(config.options.get(EditorOption.hover).enabled, "off");
    config.dispose();
  });
  test("does not emit event when nothing changes", () => {
    const config = new TestConfiguration({ glyphMargin: true, roundedSelection: false });
    let event = null;
    const disposable = config.onDidChange((e) => event = e);
    assert.strictEqual(config.options.get(EditorOption.glyphMargin), true);
    config.updateOptions({ glyphMargin: true });
    config.updateOptions({ roundedSelection: false });
    assert.strictEqual(event, null);
    config.dispose();
    disposable.dispose();
  });
  test("issue #94931: Unable to open source file", () => {
    const config = new TestConfiguration({ quickSuggestions: null });
    const actual = config.options.get(EditorOption.quickSuggestions);
    assert.deepStrictEqual(actual, {
      other: "offWhenInlineCompletions",
      comments: "off",
      strings: "off"
    });
    config.dispose();
  });
  test("issue #102920: Can't snap or split view with JSON files", () => {
    const config = new TestConfiguration({ quickSuggestions: null });
    config.updateOptions({ quickSuggestions: { strings: true } });
    const actual = config.options.get(EditorOption.quickSuggestions);
    assert.deepStrictEqual(actual, {
      other: "offWhenInlineCompletions",
      comments: "off",
      strings: "on"
    });
    config.dispose();
  });
  test("issue #151926: Untyped editor options apply", () => {
    const config = new TestConfiguration({});
    config.updateOptions({ unicodeHighlight: { allowedCharacters: { "x": true } } });
    const actual = config.options.get(EditorOption.unicodeHighlighting);
    assert.deepStrictEqual(
      actual,
      {
        nonBasicASCII: "inUntrustedWorkspace",
        invisibleCharacters: true,
        ambiguousCharacters: true,
        includeComments: "inUntrustedWorkspace",
        includeStrings: "inUntrustedWorkspace",
        allowedCharacters: { "x": true },
        allowedLocales: { "_os": true, "_vscode": true }
      }
    );
    config.dispose();
  });
});
suite("migrateOptions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function migrate(options) {
    migrateOptions(options);
    return options;
  }
  test("wordWrap", () => {
    assert.deepStrictEqual(migrate({ wordWrap: true }), { wordWrap: "on" });
    assert.deepStrictEqual(migrate({ wordWrap: false }), { wordWrap: "off" });
  });
  test("lineNumbers", () => {
    assert.deepStrictEqual(migrate({ lineNumbers: true }), { lineNumbers: "on" });
    assert.deepStrictEqual(migrate({ lineNumbers: false }), { lineNumbers: "off" });
  });
  test("autoClosingBrackets", () => {
    assert.deepStrictEqual(migrate({ autoClosingBrackets: false }), { autoClosingBrackets: "never", autoClosingQuotes: "never", autoSurround: "never" });
  });
  test("cursorBlinking", () => {
    assert.deepStrictEqual(migrate({ cursorBlinking: "visible" }), { cursorBlinking: "solid" });
  });
  test("renderWhitespace", () => {
    assert.deepStrictEqual(migrate({ renderWhitespace: true }), { renderWhitespace: "boundary" });
    assert.deepStrictEqual(migrate({ renderWhitespace: false }), { renderWhitespace: "none" });
  });
  test("renderLineHighlight", () => {
    assert.deepStrictEqual(migrate({ renderLineHighlight: true }), { renderLineHighlight: "line" });
    assert.deepStrictEqual(migrate({ renderLineHighlight: false }), { renderLineHighlight: "none" });
  });
  test("acceptSuggestionOnEnter", () => {
    assert.deepStrictEqual(migrate({ acceptSuggestionOnEnter: true }), { acceptSuggestionOnEnter: "on" });
    assert.deepStrictEqual(migrate({ acceptSuggestionOnEnter: false }), { acceptSuggestionOnEnter: "off" });
  });
  test("tabCompletion", () => {
    assert.deepStrictEqual(migrate({ tabCompletion: true }), { tabCompletion: "onlySnippets" });
    assert.deepStrictEqual(migrate({ tabCompletion: false }), { tabCompletion: "off" });
  });
  test("suggest.filteredTypes", () => {
    assert.deepStrictEqual(
      migrate({
        suggest: {
          filteredTypes: {
            method: false,
            function: false,
            constructor: false,
            deprecated: false,
            field: false,
            variable: false,
            class: false,
            struct: false,
            interface: false,
            module: false,
            property: false,
            event: false,
            operator: false,
            unit: false,
            value: false,
            constant: false,
            enum: false,
            enumMember: false,
            keyword: false,
            text: false,
            color: false,
            file: false,
            reference: false,
            folder: false,
            typeParameter: false,
            snippet: false
          }
        }
      }),
      {
        suggest: {
          filteredTypes: void 0,
          showMethods: false,
          showFunctions: false,
          showConstructors: false,
          showDeprecated: false,
          showFields: false,
          showVariables: false,
          showClasses: false,
          showStructs: false,
          showInterfaces: false,
          showModules: false,
          showProperties: false,
          showEvents: false,
          showOperators: false,
          showUnits: false,
          showValues: false,
          showConstants: false,
          showEnums: false,
          showEnumMembers: false,
          showKeywords: false,
          showWords: false,
          showColors: false,
          showFiles: false,
          showReferences: false,
          showFolders: false,
          showTypeParameters: false,
          showSnippets: false
        }
      }
    );
  });
  test("quickSuggestions", () => {
    assert.deepStrictEqual(migrate({ quickSuggestions: true }), { quickSuggestions: { comments: "on", strings: "on", other: "on" } });
    assert.deepStrictEqual(migrate({ quickSuggestions: false }), { quickSuggestions: { comments: "off", strings: "off", other: "off" } });
    assert.deepStrictEqual(migrate({ quickSuggestions: { comments: "on", strings: "off" } }), { quickSuggestions: { comments: "on", strings: "off" } });
  });
  test("hover", () => {
    assert.deepStrictEqual(migrate({ hover: true }), { hover: { enabled: "on" } });
    assert.deepStrictEqual(migrate({ hover: false }), { hover: { enabled: "off" } });
  });
  test("parameterHints", () => {
    assert.deepStrictEqual(migrate({ parameterHints: true }), { parameterHints: { enabled: true } });
    assert.deepStrictEqual(migrate({ parameterHints: false }), { parameterHints: { enabled: false } });
  });
  test("autoIndent", () => {
    assert.deepStrictEqual(migrate({ autoIndent: true }), { autoIndent: "full" });
    assert.deepStrictEqual(migrate({ autoIndent: false }), { autoIndent: "advanced" });
  });
  test("matchBrackets", () => {
    assert.deepStrictEqual(migrate({ matchBrackets: true }), { matchBrackets: "always" });
    assert.deepStrictEqual(migrate({ matchBrackets: false }), { matchBrackets: "never" });
  });
  test("renderIndentGuides, highlightActiveIndentGuide", () => {
    assert.deepStrictEqual(migrate({ renderIndentGuides: true }), { renderIndentGuides: void 0, guides: { indentation: true } });
    assert.deepStrictEqual(migrate({ renderIndentGuides: false }), { renderIndentGuides: void 0, guides: { indentation: false } });
    assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: true }), { highlightActiveIndentGuide: void 0, guides: { highlightActiveIndentation: true } });
    assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: false }), { highlightActiveIndentGuide: void 0, guides: { highlightActiveIndentation: false } });
  });
  test("migration does not overwrite new setting", () => {
    assert.deepStrictEqual(migrate({ renderIndentGuides: true, guides: { indentation: false } }), { renderIndentGuides: void 0, guides: { indentation: false } });
    assert.deepStrictEqual(migrate({ highlightActiveIndentGuide: true, guides: { highlightActiveIndentation: false } }), { highlightActiveIndentGuide: void 0, guides: { highlightActiveIndentation: false } });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUVudkNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG1pZ3JhdGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb25maWcvbWlncmF0ZU9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yT3B0aW9uLCBJRWRpdG9ySG92ZXJPcHRpb25zLCBJUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yWm9vbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yWm9vbS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4vdGVzdENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVN1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcblxuc3VpdGUoJ0NvbW1vbiBFZGl0b3IgQ29uZmlnJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ1pvb20gTGV2ZWwnLCAoKSA9PiB7XG5cblx0XHQvL1pvb20gbGV2ZWxzIGFyZSBkZWZpbmVkIHRvIGdvIGJldHdlZW4gLTUsIDIwIGluY2x1c2l2ZVxuXHRcdGNvbnN0IHpvb20gPSBFZGl0b3Jab29tO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIDApO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoLTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6b29tLmdldFpvb21MZXZlbCgpLCAwKTtcblxuXHRcdHpvb20uc2V0Wm9vbUxldmVsKDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6b29tLmdldFpvb21MZXZlbCgpLCA1KTtcblxuXHRcdHpvb20uc2V0Wm9vbUxldmVsKC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoem9vbS5nZXRab29tTGV2ZWwoKSwgLTEpO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIDkpO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoLTkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6b29tLmdldFpvb21MZXZlbCgpLCAtNSk7XG5cblx0XHR6b29tLnNldFpvb21MZXZlbCgyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIDIwKTtcblxuXHRcdHpvb20uc2V0Wm9vbUxldmVsKC0xMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIC01KTtcblxuXHRcdHpvb20uc2V0Wm9vbUxldmVsKDkuMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHpvb20uZ2V0Wm9vbUxldmVsKCksIDkuMSk7XG5cblx0XHR6b29tLnNldFpvb21MZXZlbCgtOS4xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoem9vbS5nZXRab29tTGV2ZWwoKSwgLTUpO1xuXG5cdFx0em9vbS5zZXRab29tTGV2ZWwoSW5maW5pdHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6b29tLmdldFpvb21MZXZlbCgpLCAyMCk7XG5cblx0XHR6b29tLnNldFpvb21MZXZlbChOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh6b29tLmdldFpvb21MZXZlbCgpLCAtNSk7XG5cdH0pO1xuXG5cdGNsYXNzIFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24gZXh0ZW5kcyBUZXN0Q29uZmlndXJhdGlvbiB7XG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZWFkRW52Q29uZmlndXJhdGlvbigpOiBJRW52Q29uZmlndXJhdGlvbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHRyYUVkaXRvckNsYXNzTmFtZTogJycsXG5cdFx0XHRcdG91dGVyV2lkdGg6IDEwMDAsXG5cdFx0XHRcdG91dGVySGVpZ2h0OiAxMDAsXG5cdFx0XHRcdGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkOiB0cnVlLFxuXHRcdFx0XHRwaXhlbFJhdGlvOiAxLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5U3VwcG9ydDogQWNjZXNzaWJpbGl0eVN1cHBvcnQuVW5rbm93bixcblx0XHRcdFx0ZWRpdENvbnRleHRTdXBwb3J0ZWQ6IHRydWUsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFdyYXBwaW5nKGNvbmZpZzogVGVzdENvbmZpZ3VyYXRpb24sIGlzVmlld3BvcnRXcmFwcGluZzogYm9vbGVhbiwgd3JhcHBpbmdDb2x1bW46IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBjb25maWcub3B0aW9ucztcblx0XHRjb25zdCB3cmFwcGluZ0luZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JhcHBpbmdJbmZvLmlzVmlld3BvcnRXcmFwcGluZywgaXNWaWV3cG9ydFdyYXBwaW5nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JhcHBpbmdJbmZvLndyYXBwaW5nQ29sdW1uLCB3cmFwcGluZ0NvbHVtbik7XG5cdH1cblxuXHR0ZXN0KCd3b3JkV3JhcCBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHt9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIGZhbHNlLCAtMSk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgY29tcGF0IGZhbHNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0d29yZFdyYXA6IDxhbnk+ZmFsc2Vcblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIGZhbHNlLCAtMSk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgY29tcGF0IHRydWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHR3b3JkV3JhcDogPGFueT50cnVlXG5cdFx0fSk7XG5cdFx0YXNzZXJ0V3JhcHBpbmcoY29uZmlnLCB0cnVlLCA4MCk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICdvbidcblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIHRydWUsIDgwKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCBvbiB3aXRob3V0IG1pbmltYXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICdvbicsXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0V3JhcHBpbmcoY29uZmlnLCB0cnVlLCA4OCk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgb24gZG9lcyBub3QgdXNlIHdvcmRXcmFwQ29sdW1uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHtcblx0XHRcdHdvcmRXcmFwOiAnb24nLFxuXHRcdFx0d29yZFdyYXBDb2x1bW46IDEwXG5cdFx0fSk7XG5cdFx0YXNzZXJ0V3JhcHBpbmcoY29uZmlnLCB0cnVlLCA4MCk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgb2ZmJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHtcblx0XHRcdHdvcmRXcmFwOiAnb2ZmJ1xuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgZmFsc2UsIC0xKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCBvZmYgZG9lcyBub3QgdXNlIHdvcmRXcmFwQ29sdW1uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHtcblx0XHRcdHdvcmRXcmFwOiAnb2ZmJyxcblx0XHRcdHdvcmRXcmFwQ29sdW1uOiAxMFxuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgZmFsc2UsIC0xKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCB3b3JkV3JhcENvbHVtbiB1c2VzIGRlZmF1bHQgd29yZFdyYXBDb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICd3b3JkV3JhcENvbHVtbidcblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIGZhbHNlLCA4MCk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd29yZFdyYXAgd29yZFdyYXBDb2x1bW4gdXNlcyB3b3JkV3JhcENvbHVtbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdFdyYXBwaW5nQ29uZmlndXJhdGlvbih7XG5cdFx0XHR3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJyxcblx0XHRcdHdvcmRXcmFwQ29sdW1uOiAxMDBcblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIGZhbHNlLCAxMDApO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmRXcmFwIHdvcmRXcmFwQ29sdW1uIHZhbGlkYXRlcyB3b3JkV3JhcENvbHVtbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdFdyYXBwaW5nQ29uZmlndXJhdGlvbih7XG5cdFx0XHR3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJyxcblx0XHRcdHdvcmRXcmFwQ29sdW1uOiAtMVxuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgZmFsc2UsIDEpO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmRXcmFwIGJvdW5kZWQgdXNlcyBkZWZhdWx0IHdvcmRXcmFwQ29sdW1uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHtcblx0XHRcdHdvcmRXcmFwOiAnYm91bmRlZCdcblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIHRydWUsIDgwKTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JkV3JhcCBib3VuZGVkIHVzZXMgd29yZFdyYXBDb2x1bW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RXcmFwcGluZ0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0d29yZFdyYXA6ICdib3VuZGVkJyxcblx0XHRcdHdvcmRXcmFwQ29sdW1uOiA0MFxuXHRcdH0pO1xuXHRcdGFzc2VydFdyYXBwaW5nKGNvbmZpZywgdHJ1ZSwgNDApO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmRXcmFwIGJvdW5kZWQgdmFsaWRhdGVzIHdvcmRXcmFwQ29sdW1uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0V3JhcHBpbmdDb25maWd1cmF0aW9uKHtcblx0XHRcdHdvcmRXcmFwOiAnYm91bmRlZCcsXG5cdFx0XHR3b3JkV3JhcENvbHVtbjogLTFcblx0XHR9KTtcblx0XHRhc3NlcnRXcmFwcGluZyhjb25maWcsIHRydWUsIDEpO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM1MzE1MjogQ2Fubm90IGFzc2lnbiB0byByZWFkIG9ubHkgcHJvcGVydHkgXFwnZW5hYmxlZFxcJyBvZiBvYmplY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG92ZXJPcHRpb25zOiBJRWRpdG9ySG92ZXJPcHRpb25zID0ge307XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGhvdmVyT3B0aW9ucywgJ2VuYWJsZWQnLCB7XG5cdFx0XHR3cml0YWJsZTogZmFsc2UsXG5cdFx0XHR2YWx1ZTogJ29uJ1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvbih7IGhvdmVyOiBob3Zlck9wdGlvbnMgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5ob3ZlcikuZW5hYmxlZCwgJ29uJyk7XG5cdFx0Y29uZmlnLnVwZGF0ZU9wdGlvbnMoeyBob3ZlcjogeyBlbmFibGVkOiAnb2ZmJyB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmhvdmVyKS5lbmFibGVkLCAnb2ZmJyk7XG5cblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBlbWl0IGV2ZW50IHdoZW4gbm90aGluZyBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvbih7IGdseXBoTWFyZ2luOiB0cnVlLCByb3VuZGVkU2VsZWN0aW9uOiBmYWxzZSB9KTtcblx0XHRsZXQgZXZlbnQ6IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQgfCBudWxsID0gbnVsbDtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gY29uZmlnLm9uRGlkQ2hhbmdlKGUgPT4gZXZlbnQgPSBlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlnLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5nbHlwaE1hcmdpbiksIHRydWUpO1xuXG5cdFx0Y29uZmlnLnVwZGF0ZU9wdGlvbnMoeyBnbHlwaE1hcmdpbjogdHJ1ZSB9KTtcblx0XHRjb25maWcudXBkYXRlT3B0aW9ucyh7IHJvdW5kZWRTZWxlY3Rpb246IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudCwgbnVsbCk7XG5cdFx0Y29uZmlnLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzk0OTMxOiBVbmFibGUgdG8gb3BlbiBzb3VyY2UgZmlsZScsICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb24oeyBxdWlja1N1Z2dlc3Rpb25zOiBudWxsISB9KTtcblx0XHRjb25zdCBhY3R1YWwgPSA8UmVhZG9ubHk8UmVxdWlyZWQ8SVF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zPj4+Y29uZmlnLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5xdWlja1N1Z2dlc3Rpb25zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0b3RoZXI6ICdvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMnLFxuXHRcdFx0Y29tbWVudHM6ICdvZmYnLFxuXHRcdFx0c3RyaW5nczogJ29mZidcblx0XHR9KTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTAyOTIwOiBDYW5cXCd0IHNuYXAgb3Igc3BsaXQgdmlldyB3aXRoIEpTT04gZmlsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uKHsgcXVpY2tTdWdnZXN0aW9uczogbnVsbCEgfSk7XG5cdFx0Y29uZmlnLnVwZGF0ZU9wdGlvbnMoeyBxdWlja1N1Z2dlc3Rpb25zOiB7IHN0cmluZ3M6IHRydWUgfSB9KTtcblx0XHRjb25zdCBhY3R1YWwgPSA8UmVhZG9ubHk8UmVxdWlyZWQ8SVF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zPj4+Y29uZmlnLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5xdWlja1N1Z2dlc3Rpb25zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwge1xuXHRcdFx0b3RoZXI6ICdvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMnLFxuXHRcdFx0Y29tbWVudHM6ICdvZmYnLFxuXHRcdFx0c3RyaW5nczogJ29uJ1xuXHRcdH0pO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTE5MjY6IFVudHlwZWQgZWRpdG9yIG9wdGlvbnMgYXBwbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uKHt9KTtcblx0XHRjb25maWcudXBkYXRlT3B0aW9ucyh7IHVuaWNvZGVIaWdobGlnaHQ6IHsgYWxsb3dlZENoYXJhY3RlcnM6IHsgJ3gnOiB0cnVlIH0gfSB9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBjb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnVuaWNvZGVIaWdobGlnaHRpbmcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLFxuXHRcdFx0e1xuXHRcdFx0XHRub25CYXNpY0FTQ0lJOiAnaW5VbnRydXN0ZWRXb3Jrc3BhY2UnLFxuXHRcdFx0XHRpbnZpc2libGVDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0XHRhbWJpZ3VvdXNDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0XHRpbmNsdWRlQ29tbWVudHM6ICdpblVudHJ1c3RlZFdvcmtzcGFjZScsXG5cdFx0XHRcdGluY2x1ZGVTdHJpbmdzOiAnaW5VbnRydXN0ZWRXb3Jrc3BhY2UnLFxuXHRcdFx0XHRhbGxvd2VkQ2hhcmFjdGVyczogeyAneCc6IHRydWUgfSxcblx0XHRcdFx0YWxsb3dlZExvY2FsZXM6IHsgJ19vcyc6IHRydWUsICdfdnNjb2RlJzogdHJ1ZSB9XG5cdFx0XHR9XG5cdFx0KTtcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnbWlncmF0ZU9wdGlvbnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gbWlncmF0ZShvcHRpb25zOiBhbnkpOiBhbnkge1xuXHRcdG1pZ3JhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cblx0dGVzdCgnd29yZFdyYXAnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgd29yZFdyYXA6IHRydWUgfSksIHsgd29yZFdyYXA6ICdvbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgd29yZFdyYXA6IGZhbHNlIH0pLCB7IHdvcmRXcmFwOiAnb2ZmJyB9KTtcblx0fSk7XG5cdHRlc3QoJ2xpbmVOdW1iZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGxpbmVOdW1iZXJzOiB0cnVlIH0pLCB7IGxpbmVOdW1iZXJzOiAnb24nIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGxpbmVOdW1iZXJzOiBmYWxzZSB9KSwgeyBsaW5lTnVtYmVyczogJ29mZicgfSk7XG5cdH0pO1xuXHR0ZXN0KCdhdXRvQ2xvc2luZ0JyYWNrZXRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGF1dG9DbG9zaW5nQnJhY2tldHM6IGZhbHNlIH0pLCB7IGF1dG9DbG9zaW5nQnJhY2tldHM6ICduZXZlcicsIGF1dG9DbG9zaW5nUXVvdGVzOiAnbmV2ZXInLCBhdXRvU3Vycm91bmQ6ICduZXZlcicgfSk7XG5cdH0pO1xuXHR0ZXN0KCdjdXJzb3JCbGlua2luZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBjdXJzb3JCbGlua2luZzogJ3Zpc2libGUnIH0pLCB7IGN1cnNvckJsaW5raW5nOiAnc29saWQnIH0pO1xuXHR9KTtcblx0dGVzdCgncmVuZGVyV2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyByZW5kZXJXaGl0ZXNwYWNlOiB0cnVlIH0pLCB7IHJlbmRlcldoaXRlc3BhY2U6ICdib3VuZGFyeScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcmVuZGVyV2hpdGVzcGFjZTogZmFsc2UgfSksIHsgcmVuZGVyV2hpdGVzcGFjZTogJ25vbmUnIH0pO1xuXHR9KTtcblx0dGVzdCgncmVuZGVyTGluZUhpZ2hsaWdodCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyByZW5kZXJMaW5lSGlnaGxpZ2h0OiB0cnVlIH0pLCB7IHJlbmRlckxpbmVIaWdobGlnaHQ6ICdsaW5lJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyByZW5kZXJMaW5lSGlnaGxpZ2h0OiBmYWxzZSB9KSwgeyByZW5kZXJMaW5lSGlnaGxpZ2h0OiAnbm9uZScgfSk7XG5cdH0pO1xuXHR0ZXN0KCdhY2NlcHRTdWdnZXN0aW9uT25FbnRlcicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBhY2NlcHRTdWdnZXN0aW9uT25FbnRlcjogdHJ1ZSB9KSwgeyBhY2NlcHRTdWdnZXN0aW9uT25FbnRlcjogJ29uJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBhY2NlcHRTdWdnZXN0aW9uT25FbnRlcjogZmFsc2UgfSksIHsgYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXI6ICdvZmYnIH0pO1xuXHR9KTtcblx0dGVzdCgndGFiQ29tcGxldGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyB0YWJDb21wbGV0aW9uOiB0cnVlIH0pLCB7IHRhYkNvbXBsZXRpb246ICdvbmx5U25pcHBldHMnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IHRhYkNvbXBsZXRpb246IGZhbHNlIH0pLCB7IHRhYkNvbXBsZXRpb246ICdvZmYnIH0pO1xuXHR9KTtcblx0dGVzdCgnc3VnZ2VzdC5maWx0ZXJlZFR5cGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRtaWdyYXRlKHtcblx0XHRcdFx0c3VnZ2VzdDoge1xuXHRcdFx0XHRcdGZpbHRlcmVkVHlwZXM6IHtcblx0XHRcdFx0XHRcdG1ldGhvZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRmdW5jdGlvbjogZmFsc2UsXG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3RvcjogZmFsc2UsXG5cdFx0XHRcdFx0XHRkZXByZWNhdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGZpZWxkOiBmYWxzZSxcblx0XHRcdFx0XHRcdHZhcmlhYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRcdGNsYXNzOiBmYWxzZSxcblx0XHRcdFx0XHRcdHN0cnVjdDogZmFsc2UsXG5cdFx0XHRcdFx0XHRpbnRlcmZhY2U6IGZhbHNlLFxuXHRcdFx0XHRcdFx0bW9kdWxlOiBmYWxzZSxcblx0XHRcdFx0XHRcdHByb3BlcnR5OiBmYWxzZSxcblx0XHRcdFx0XHRcdGV2ZW50OiBmYWxzZSxcblx0XHRcdFx0XHRcdG9wZXJhdG9yOiBmYWxzZSxcblx0XHRcdFx0XHRcdHVuaXQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Y29uc3RhbnQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0ZW51bTogZmFsc2UsXG5cdFx0XHRcdFx0XHRlbnVtTWVtYmVyOiBmYWxzZSxcblx0XHRcdFx0XHRcdGtleXdvcmQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dGV4dDogZmFsc2UsXG5cdFx0XHRcdFx0XHRjb2xvcjogZmFsc2UsXG5cdFx0XHRcdFx0XHRmaWxlOiBmYWxzZSxcblx0XHRcdFx0XHRcdHJlZmVyZW5jZTogZmFsc2UsXG5cdFx0XHRcdFx0XHRmb2xkZXI6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dHlwZVBhcmFtZXRlcjogZmFsc2UsXG5cdFx0XHRcdFx0XHRzbmlwcGV0OiBmYWxzZSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pLCB7XG5cdFx0XHRzdWdnZXN0OiB7XG5cdFx0XHRcdGZpbHRlcmVkVHlwZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2hvd01ldGhvZHM6IGZhbHNlLFxuXHRcdFx0XHRzaG93RnVuY3Rpb25zOiBmYWxzZSxcblx0XHRcdFx0c2hvd0NvbnN0cnVjdG9yczogZmFsc2UsXG5cdFx0XHRcdHNob3dEZXByZWNhdGVkOiBmYWxzZSxcblx0XHRcdFx0c2hvd0ZpZWxkczogZmFsc2UsXG5cdFx0XHRcdHNob3dWYXJpYWJsZXM6IGZhbHNlLFxuXHRcdFx0XHRzaG93Q2xhc3NlczogZmFsc2UsXG5cdFx0XHRcdHNob3dTdHJ1Y3RzOiBmYWxzZSxcblx0XHRcdFx0c2hvd0ludGVyZmFjZXM6IGZhbHNlLFxuXHRcdFx0XHRzaG93TW9kdWxlczogZmFsc2UsXG5cdFx0XHRcdHNob3dQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0c2hvd0V2ZW50czogZmFsc2UsXG5cdFx0XHRcdHNob3dPcGVyYXRvcnM6IGZhbHNlLFxuXHRcdFx0XHRzaG93VW5pdHM6IGZhbHNlLFxuXHRcdFx0XHRzaG93VmFsdWVzOiBmYWxzZSxcblx0XHRcdFx0c2hvd0NvbnN0YW50czogZmFsc2UsXG5cdFx0XHRcdHNob3dFbnVtczogZmFsc2UsXG5cdFx0XHRcdHNob3dFbnVtTWVtYmVyczogZmFsc2UsXG5cdFx0XHRcdHNob3dLZXl3b3JkczogZmFsc2UsXG5cdFx0XHRcdHNob3dXb3JkczogZmFsc2UsXG5cdFx0XHRcdHNob3dDb2xvcnM6IGZhbHNlLFxuXHRcdFx0XHRzaG93RmlsZXM6IGZhbHNlLFxuXHRcdFx0XHRzaG93UmVmZXJlbmNlczogZmFsc2UsXG5cdFx0XHRcdHNob3dGb2xkZXJzOiBmYWxzZSxcblx0XHRcdFx0c2hvd1R5cGVQYXJhbWV0ZXJzOiBmYWxzZSxcblx0XHRcdFx0c2hvd1NuaXBwZXRzOiBmYWxzZSxcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ3F1aWNrU3VnZ2VzdGlvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcXVpY2tTdWdnZXN0aW9uczogdHJ1ZSB9KSwgeyBxdWlja1N1Z2dlc3Rpb25zOiB7IGNvbW1lbnRzOiAnb24nLCBzdHJpbmdzOiAnb24nLCBvdGhlcjogJ29uJyB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IHF1aWNrU3VnZ2VzdGlvbnM6IGZhbHNlIH0pLCB7IHF1aWNrU3VnZ2VzdGlvbnM6IHsgY29tbWVudHM6ICdvZmYnLCBzdHJpbmdzOiAnb2ZmJywgb3RoZXI6ICdvZmYnIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcXVpY2tTdWdnZXN0aW9uczogeyBjb21tZW50czogJ29uJywgc3RyaW5nczogJ29mZicgfSB9KSwgeyBxdWlja1N1Z2dlc3Rpb25zOiB7IGNvbW1lbnRzOiAnb24nLCBzdHJpbmdzOiAnb2ZmJyB9IH0pO1xuXHR9KTtcblx0dGVzdCgnaG92ZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgaG92ZXI6IHRydWUgfSksIHsgaG92ZXI6IHsgZW5hYmxlZDogJ29uJyB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGhvdmVyOiBmYWxzZSB9KSwgeyBob3ZlcjogeyBlbmFibGVkOiAnb2ZmJyB9IH0pO1xuXHR9KTtcblx0dGVzdCgncGFyYW1ldGVySGludHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcGFyYW1ldGVySGludHM6IHRydWUgfSksIHsgcGFyYW1ldGVySGludHM6IHsgZW5hYmxlZDogdHJ1ZSB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IHBhcmFtZXRlckhpbnRzOiBmYWxzZSB9KSwgeyBwYXJhbWV0ZXJIaW50czogeyBlbmFibGVkOiBmYWxzZSB9IH0pO1xuXHR9KTtcblx0dGVzdCgnYXV0b0luZGVudCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBhdXRvSW5kZW50OiB0cnVlIH0pLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBhdXRvSW5kZW50OiBmYWxzZSB9KSwgeyBhdXRvSW5kZW50OiAnYWR2YW5jZWQnIH0pO1xuXHR9KTtcblx0dGVzdCgnbWF0Y2hCcmFja2V0cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBtYXRjaEJyYWNrZXRzOiB0cnVlIH0pLCB7IG1hdGNoQnJhY2tldHM6ICdhbHdheXMnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IG1hdGNoQnJhY2tldHM6IGZhbHNlIH0pLCB7IG1hdGNoQnJhY2tldHM6ICduZXZlcicgfSk7XG5cdH0pO1xuXHR0ZXN0KCdyZW5kZXJJbmRlbnRHdWlkZXMsIGhpZ2hsaWdodEFjdGl2ZUluZGVudEd1aWRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IHJlbmRlckluZGVudEd1aWRlczogdHJ1ZSB9KSwgeyByZW5kZXJJbmRlbnRHdWlkZXM6IHVuZGVmaW5lZCwgZ3VpZGVzOiB7IGluZGVudGF0aW9uOiB0cnVlIH0gfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcmVuZGVySW5kZW50R3VpZGVzOiBmYWxzZSB9KSwgeyByZW5kZXJJbmRlbnRHdWlkZXM6IHVuZGVmaW5lZCwgZ3VpZGVzOiB7IGluZGVudGF0aW9uOiBmYWxzZSB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGhpZ2hsaWdodEFjdGl2ZUluZGVudEd1aWRlOiB0cnVlIH0pLCB7IGhpZ2hsaWdodEFjdGl2ZUluZGVudEd1aWRlOiB1bmRlZmluZWQsIGd1aWRlczogeyBoaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbjogdHJ1ZSB9IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWlncmF0ZSh7IGhpZ2hsaWdodEFjdGl2ZUluZGVudEd1aWRlOiBmYWxzZSB9KSwgeyBoaWdobGlnaHRBY3RpdmVJbmRlbnRHdWlkZTogdW5kZWZpbmVkLCBndWlkZXM6IHsgaGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb246IGZhbHNlIH0gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pZ3JhdGlvbiBkb2VzIG5vdCBvdmVyd3JpdGUgbmV3IHNldHRpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtaWdyYXRlKHsgcmVuZGVySW5kZW50R3VpZGVzOiB0cnVlLCBndWlkZXM6IHsgaW5kZW50YXRpb246IGZhbHNlIH0gfSksIHsgcmVuZGVySW5kZW50R3VpZGVzOiB1bmRlZmluZWQsIGd1aWRlczogeyBpbmRlbnRhdGlvbjogZmFsc2UgfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1pZ3JhdGUoeyBoaWdobGlnaHRBY3RpdmVJbmRlbnRHdWlkZTogdHJ1ZSwgZ3VpZGVzOiB7IGhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uOiBmYWxzZSB9IH0pLCB7IGhpZ2hsaWdodEFjdGl2ZUluZGVudEd1aWRlOiB1bmRlZmluZWQsIGd1aWRlczogeyBoaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbjogZmFsc2UgfSB9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFvQyxvQkFBbUU7QUFDdkcsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFFckMsTUFBTSx3QkFBd0IsTUFBTTtBQUVuQywwQ0FBd0M7QUFFeEMsT0FBSyxjQUFjLE1BQU07QUFHeEIsVUFBTSxPQUFPO0FBRWIsU0FBSyxhQUFhLENBQUM7QUFDbkIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLENBQUM7QUFFekMsU0FBSyxhQUFhLEVBQUU7QUFDcEIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLENBQUM7QUFFekMsU0FBSyxhQUFhLENBQUM7QUFDbkIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLENBQUM7QUFFekMsU0FBSyxhQUFhLEVBQUU7QUFDcEIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLEVBQUU7QUFFMUMsU0FBSyxhQUFhLENBQUM7QUFDbkIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLENBQUM7QUFFekMsU0FBSyxhQUFhLEVBQUU7QUFDcEIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLEVBQUU7QUFFMUMsU0FBSyxhQUFhLEVBQUU7QUFDcEIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLEVBQUU7QUFFMUMsU0FBSyxhQUFhLEdBQUc7QUFDckIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLEVBQUU7QUFFMUMsU0FBSyxhQUFhLEdBQUc7QUFDckIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLEdBQUc7QUFFM0MsU0FBSyxhQUFhLElBQUk7QUFDdEIsV0FBTyxZQUFZLEtBQUssYUFBYSxHQUFHLEVBQUU7QUFFMUMsU0FBSyxh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
