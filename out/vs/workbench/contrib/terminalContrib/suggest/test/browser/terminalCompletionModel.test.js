import assert, { notStrictEqual, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TerminalCompletionModel } from "../../browser/terminalCompletionModel.js";
import { LineContext } from "../../../../../services/suggest/browser/simpleCompletionModel.js";
import { TerminalCompletionItem, TerminalCompletionItemKind } from "../../browser/terminalCompletionItem.js";
function createItem(options) {
  return new TerminalCompletionItem({
    ...options,
    kind: options.kind ?? TerminalCompletionItemKind.Method,
    label: options.label || "defaultLabel",
    provider: options.provider || "defaultProvider",
    replacementRange: options.replacementRange || [0, 1]
  });
}
function createFileItems(...labels) {
  return labels.map((label) => createItem({ label, kind: TerminalCompletionItemKind.File }));
}
function createFileItemsModel(...labels) {
  return new TerminalCompletionModel(
    createFileItems(...labels),
    new LineContext("", 0)
  );
}
function createFolderItems(...labels) {
  return labels.map((label) => createItem({ label, kind: TerminalCompletionItemKind.Folder }));
}
function createFolderItemsModel(...labels) {
  return new TerminalCompletionModel(
    createFolderItems(...labels),
    new LineContext("", 0)
  );
}
function assertItems(model, labels) {
  assert.deepStrictEqual(model.items.map((i) => i.completion.label), labels);
  assert.strictEqual(model.items.length, labels.length);
}
suite("TerminalCompletionModel", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  let model;
  test("should handle an empty list", function() {
    model = new TerminalCompletionModel([], new LineContext("", 0));
    assert.strictEqual(model.items.length, 0);
  });
  test("should handle a list with one item", function() {
    model = new TerminalCompletionModel([
      createItem({ label: "a" })
    ], new LineContext("", 0));
    assert.strictEqual(model.items.length, 1);
    assert.strictEqual(model.items[0].completion.label, "a");
  });
  test("should sort alphabetically", function() {
    model = new TerminalCompletionModel([
      createItem({ label: "b" }),
      createItem({ label: "z" }),
      createItem({ label: "a" })
    ], new LineContext("", 0));
    assert.strictEqual(model.items.length, 3);
    assert.strictEqual(model.items[0].completion.label, "a");
    assert.strictEqual(model.items[1].completion.label, "b");
    assert.strictEqual(model.items[2].completion.label, "z");
  });
  test("fuzzy matching", () => {
    const initial = [
      ".\\.eslintrc",
      ".\\resources\\",
      ".\\scripts\\",
      ".\\src\\"
    ];
    const expected = [
      ".\\scripts\\",
      ".\\src\\",
      ".\\.eslintrc",
      ".\\resources\\"
    ];
    model = new TerminalCompletionModel(initial.map((e) => createItem({ label: e })), new LineContext("s", 0));
    assertItems(model, expected);
  });
  suite("files and folders", () => {
    test("should deprioritize files that start with underscore", function() {
      const initial = ["_a", "a", "z"];
      const expected = ["a", "z", "_a"];
      assertItems(createFileItemsModel(...initial), expected);
      assertItems(createFolderItemsModel(...initial), expected);
    });
    test("should ignore the dot in dotfiles when sorting", function() {
      const initial = ["b", ".a", "a", ".b"];
      const expected = [".a", "a", "b", ".b"];
      assertItems(createFileItemsModel(...initial), expected);
      assertItems(createFolderItemsModel(...initial), expected);
    });
    test("should handle many files and folders correctly", function() {
      const items = [
        ...createFolderItems(
          "__pycache",
          ".build",
          ".configurations",
          ".devcontainer",
          ".eslint-plugin-local",
          ".github",
          ".profile-oss",
          ".vscode",
          ".vscode-test",
          "build",
          "cli",
          "extensions",
          "node_modules",
          "out",
          "remote",
          "resources",
          "scripts",
          "src",
          "test"
        ),
        ...createFileItems(
          "__init__.py",
          ".editorconfig",
          ".eslint-ignore",
          ".git-blame-ignore-revs",
          ".gitattributes",
          ".gitignore",
          ".lsifrc.json",
          ".mailmap",
          ".mention-bot",
          ".npmrc",
          ".nvmrc",
          ".vscode-test.js",
          "cglicenses.json",
          "cgmanifest.json",
          "CodeQL.yml",
          "CONTRIBUTING.md",
          "eslint.config.js",
          "gulpfile.js",
          "LICENSE.txt",
          "package-lock.json",
          "package.json",
          "product.json",
          "README.md",
          "SECURITY.md",
          "ThirdPartyNotices.txt",
          "tsfmt.json"
        )
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("", 0));
      assertItems(model2, [
        ".build",
        "build",
        "cglicenses.json",
        "cgmanifest.json",
        "cli",
        "CodeQL.yml",
        ".configurations",
        "CONTRIBUTING.md",
        ".devcontainer",
        ".editorconfig",
        "eslint.config.js",
        ".eslint-ignore",
        ".eslint-plugin-local",
        "extensions",
        ".gitattributes",
        ".git-blame-ignore-revs",
        ".github",
        ".gitignore",
        "gulpfile.js",
        "LICENSE.txt",
        ".lsifrc.json",
        ".mailmap",
        ".mention-bot",
        "node_modules",
        ".npmrc",
        ".nvmrc",
        "out",
        "package.json",
        "package-lock.json",
        "product.json",
        ".profile-oss",
        "README.md",
        "remote",
        "resources",
        "scripts",
        "SECURITY.md",
        "src",
        "test",
        "ThirdPartyNotices.txt",
        "tsfmt.json",
        ".vscode",
        ".vscode-test",
        ".vscode-test.js",
        "__init__.py",
        "__pycache"
      ]);
    });
  });
  suite("Punctuation", () => {
    test("punctuation chars should be below other methods", function() {
      const items = [
        createItem({ label: "a" }),
        createItem({ label: "b" }),
        createItem({ label: "," }),
        createItem({ label: ";" }),
        createItem({ label: ":" }),
        createItem({ label: "c" }),
        createItem({ label: "[" }),
        createItem({ label: "..." })
      ];
      model = new TerminalCompletionModel(items, new LineContext("", 0));
      assertItems(model, ["a", "b", "c", ",", ";", ":", "[", "..."]);
    });
    test("punctuation chars should be below other files", function() {
      const items = [
        createItem({ label: ".." }),
        createItem({ label: "..." }),
        createItem({ label: "../" }),
        createItem({ label: "./a/" }),
        createItem({ label: "./b/" })
      ];
      model = new TerminalCompletionModel(items, new LineContext("", 0));
      assertItems(model, ["./a/", "./b/", "..", "...", "../"]);
    });
  });
  suite("inline completions", () => {
    function createItems(kind) {
      return [
        ...createFolderItems("a", "c"),
        ...createFileItems("b", "d"),
        new TerminalCompletionItem({
          label: "ab",
          provider: "core",
          replacementRange: [0, 0],
          kind
        })
      ];
    }
    suite("InlineSuggestion", () => {
      test("should put on top generally", function() {
        const model2 = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestion), new LineContext("", 0));
        strictEqual(model2.items[0].completion.label, "ab");
      });
      test("should NOT put on top when there's an exact match of another item", function() {
        const model2 = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestion), new LineContext("a", 0));
        notStrictEqual(model2.items[0].completion.label, "ab");
        strictEqual(model2.items[1].completion.label, "ab");
      });
    });
    suite("InlineSuggestionAlwaysOnTop", () => {
      test("should put on top generally", function() {
        const model2 = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop), new LineContext("", 0));
        strictEqual(model2.items[0].completion.label, "ab");
      });
      test("should put on top even if there's an exact match of another item", function() {
        const model2 = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop), new LineContext("a", 0));
        strictEqual(model2.items[0].completion.label, "ab");
      });
    });
  });
  suite("git branch priority sorting", () => {
    test("should prioritize main and master branches for git commands", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "feature-branch" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "development" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git checkout ", 0));
      assertItems(model2, ["main", "master", "development", "feature-branch"]);
    });
    test("should prioritize main and master branches for git switch command", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "feature-branch" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "another-feature" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git switch ", 0));
      assertItems(model2, ["main", "master", "another-feature", "feature-branch"]);
    });
    test("should not prioritize main and master for non-git commands", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "feature-branch" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("ls ", 0));
      assertItems(model2, ["feature-branch", "main", "master"]);
    });
    test("should handle git commands with leading whitespace", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "feature-branch" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("  git checkout ", 0));
      assertItems(model2, ["main", "master", "feature-branch"]);
    });
    test("should work with complex label objects", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: "feature-branch", description: "Feature branch" } }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: "master", description: "Master branch" } }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: "main", description: "Main branch" } })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git checkout ", 0));
      assertItems(model2, [
        { label: "main", description: "Main branch" },
        { label: "master", description: "Master branch" },
        { label: "feature-branch", description: "Feature branch" }
      ]);
    });
    test("should not prioritize branches with similar names", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "mainline" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "masterpiece" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git checkout ", 0));
      assertItems(model2, ["main", "master", "mainline", "masterpiece"]);
    });
    test("should prioritize for git branch -d", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "dev" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git branch -d ", 0));
      assertItems(model2, ["main", "master", "dev"]);
    });
  });
  suite("mixed kind sorting", () => {
    test("should sort arguments before flags and options", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Flag, label: "--verbose" }),
        createItem({ kind: TerminalCompletionItemKind.Option, label: "--config" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "value2" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "value1" }),
        createItem({ kind: TerminalCompletionItemKind.Flag, label: "--all" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("cmd ", 0));
      assertItems(model2, ["value1", "value2", "--all", "--config", "--verbose"]);
    });
    test("should sort by kind hierarchy: methods/aliases, arguments, others, files/folders", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.File, label: "file.txt" }),
        createItem({ kind: TerminalCompletionItemKind.Flag, label: "--flag" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "arg" }),
        createItem({ kind: TerminalCompletionItemKind.Method, label: "method" }),
        createItem({ kind: TerminalCompletionItemKind.Folder, label: "folder/" }),
        createItem({ kind: TerminalCompletionItemKind.Option, label: "--option" }),
        createItem({ kind: TerminalCompletionItemKind.Alias, label: "alias" }),
        createItem({ kind: TerminalCompletionItemKind.SymbolicLinkFile, label: "file2.txt" }),
        createItem({ kind: TerminalCompletionItemKind.SymbolicLinkFolder, label: "folder2/" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("", 0));
      assertItems(model2, ["alias", "method", "arg", "--flag", "--option", "file2.txt", "file.txt", "folder/", "folder2/"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9zdWdnZXN0L3Rlc3QvYnJvd3Nlci90ZXJtaW5hbENvbXBsZXRpb25Nb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQsIHsgbm90U3RyaWN0RXF1YWwsIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb21wbGV0aW9uTW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsQ29tcGxldGlvbk1vZGVsLmpzJztcbmltcG9ydCB7IExpbmVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc3VnZ2VzdC9icm93c2VyL3NpbXBsZUNvbXBsZXRpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbXBsZXRpb25JdGVtLCBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZCwgdHlwZSBJVGVybWluYWxDb21wbGV0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbENvbXBsZXRpb25JdGVtLmpzJztcbmltcG9ydCB0eXBlIHsgQ29tcGxldGlvbkl0ZW1MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3N1Z2dlc3QvYnJvd3Nlci9zaW1wbGVDb21wbGV0aW9uSXRlbS5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUl0ZW0ob3B0aW9uczogUGFydGlhbDxJVGVybWluYWxDb21wbGV0aW9uPik6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW0ge1xuXHRyZXR1cm4gbmV3IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW0oe1xuXHRcdC4uLm9wdGlvbnMsXG5cdFx0a2luZDogb3B0aW9ucy5raW5kID8/IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLk1ldGhvZCxcblx0XHRsYWJlbDogb3B0aW9ucy5sYWJlbCB8fCAnZGVmYXVsdExhYmVsJyxcblx0XHRwcm92aWRlcjogb3B0aW9ucy5wcm92aWRlciB8fCAnZGVmYXVsdFByb3ZpZGVyJyxcblx0XHRyZXBsYWNlbWVudFJhbmdlOiBvcHRpb25zLnJlcGxhY2VtZW50UmFuZ2UgfHwgWzAsIDFdLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRmlsZUl0ZW1zKC4uLmxhYmVsczogc3RyaW5nW10pOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtW10ge1xuXHRyZXR1cm4gbGFiZWxzLm1hcChsYWJlbCA9PiBjcmVhdGVJdGVtKHsgbGFiZWwsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgfSkpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVGaWxlSXRlbXNNb2RlbCguLi5sYWJlbHM6IHN0cmluZ1tdKTogVGVybWluYWxDb21wbGV0aW9uTW9kZWwge1xuXHRyZXR1cm4gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKFxuXHRcdGNyZWF0ZUZpbGVJdGVtcyguLi5sYWJlbHMpLFxuXHRcdG5ldyBMaW5lQ29udGV4dCgnJywgMClcblx0KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRm9sZGVySXRlbXMoLi4ubGFiZWxzOiBzdHJpbmdbXSk6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1bXSB7XG5cdHJldHVybiBsYWJlbHMubWFwKGxhYmVsID0+IGNyZWF0ZUl0ZW0oeyBsYWJlbCwga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyIH0pKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRm9sZGVySXRlbXNNb2RlbCguLi5sYWJlbHM6IHN0cmluZ1tdKTogVGVybWluYWxDb21wbGV0aW9uTW9kZWwge1xuXHRyZXR1cm4gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKFxuXHRcdGNyZWF0ZUZvbGRlckl0ZW1zKC4uLmxhYmVscyksXG5cdFx0bmV3IExpbmVDb250ZXh0KCcnLCAwKVxuXHQpO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRJdGVtcyhtb2RlbDogVGVybWluYWxDb21wbGV0aW9uTW9kZWwsIGxhYmVsczogKHN0cmluZyB8IENvbXBsZXRpb25JdGVtTGFiZWwpW10pOiB2b2lkIHtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5pdGVtcy5tYXAoaSA9PiBpLmNvbXBsZXRpb24ubGFiZWwpLCBsYWJlbHMpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXRlbXMubGVuZ3RoLCBsYWJlbHMubGVuZ3RoKTsgLy8gc2FuaXR5IGNoZWNrXG59XG5cbnN1aXRlKCdUZXJtaW5hbENvbXBsZXRpb25Nb2RlbCcsIGZ1bmN0aW9uICgpIHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IG1vZGVsOiBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbDtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGFuIGVtcHR5IGxpc3QnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoW10sIG5ldyBMaW5lQ29udGV4dCgnJywgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYSBsaXN0IHdpdGggb25lIGl0ZW0nLCBmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoW1xuXHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnYScgfSksXG5cdFx0XSwgbmV3IExpbmVDb250ZXh0KCcnLCAwKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuaXRlbXNbMF0uY29tcGxldGlvbi5sYWJlbCwgJ2EnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHNvcnQgYWxwaGFiZXRpY2FsbHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoW1xuXHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnYicgfSksXG5cdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICd6JyB9KSxcblx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJ2EnIH0pLFxuXHRcdF0sIG5ldyBMaW5lQ29udGV4dCgnJywgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzBdLmNvbXBsZXRpb24ubGFiZWwsICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzFdLmNvbXBsZXRpb24ubGFiZWwsICdiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzJdLmNvbXBsZXRpb24ubGFiZWwsICd6Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1enp5IG1hdGNoaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluaXRpYWwgPSBbXG5cdFx0XHQnLlxcXFwuZXNsaW50cmMnLFxuXHRcdFx0Jy5cXFxccmVzb3VyY2VzXFxcXCcsXG5cdFx0XHQnLlxcXFxzY3JpcHRzXFxcXCcsXG5cdFx0XHQnLlxcXFxzcmNcXFxcJyxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0Jy5cXFxcc2NyaXB0c1xcXFwnLFxuXHRcdFx0Jy5cXFxcc3JjXFxcXCcsXG5cdFx0XHQnLlxcXFwuZXNsaW50cmMnLFxuXHRcdFx0Jy5cXFxccmVzb3VyY2VzXFxcXCcsXG5cdFx0XTtcblx0XHRtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpbml0aWFsLm1hcChlID0+IChjcmVhdGVJdGVtKHsgbGFiZWw6IGUgfSkpKSwgbmV3IExpbmVDb250ZXh0KCdzJywgMCkpO1xuXG5cdFx0YXNzZXJ0SXRlbXMobW9kZWwsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbGVzIGFuZCBmb2xkZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBkZXByaW9yaXRpemUgZmlsZXMgdGhhdCBzdGFydCB3aXRoIHVuZGVyc2NvcmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBpbml0aWFsID0gWydfYScsICdhJywgJ3onXTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gWydhJywgJ3onLCAnX2EnXTtcblx0XHRcdGFzc2VydEl0ZW1zKGNyZWF0ZUZpbGVJdGVtc01vZGVsKC4uLmluaXRpYWwpLCBleHBlY3RlZCk7XG5cdFx0XHRhc3NlcnRJdGVtcyhjcmVhdGVGb2xkZXJJdGVtc01vZGVsKC4uLmluaXRpYWwpLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaWdub3JlIHRoZSBkb3QgaW4gZG90ZmlsZXMgd2hlbiBzb3J0aW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IFsnYicsICcuYScsICdhJywgJy5iJ107XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFsnLmEnLCAnYScsICdiJywgJy5iJ107XG5cdFx0XHRhc3NlcnRJdGVtcyhjcmVhdGVGaWxlSXRlbXNNb2RlbCguLi5pbml0aWFsKSwgZXhwZWN0ZWQpO1xuXHRcdFx0YXNzZXJ0SXRlbXMoY3JlYXRlRm9sZGVySXRlbXNNb2RlbCguLi5pbml0aWFsKSwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtYW55IGZpbGVzIGFuZCBmb2xkZXJzIGNvcnJlY3RseScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdC8vIFRoaXMgaXMgVlMgQ29kZSdzIHJvb3QgZGlyZWN0b3J5IHdpdGggc29tZSBweXRob24gaXRlbXMgYWRkZWQgdGhhdCBoYXZlIHNwZWNpYWxcblx0XHRcdC8vIHNvcnRpbmdcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHQuLi5jcmVhdGVGb2xkZXJJdGVtcyhcblx0XHRcdFx0XHQnX19weWNhY2hlJyxcblx0XHRcdFx0XHQnLmJ1aWxkJyxcblx0XHRcdFx0XHQnLmNvbmZpZ3VyYXRpb25zJyxcblx0XHRcdFx0XHQnLmRldmNvbnRhaW5lcicsXG5cdFx0XHRcdFx0Jy5lc2xpbnQtcGx1Z2luLWxvY2FsJyxcblx0XHRcdFx0XHQnLmdpdGh1YicsXG5cdFx0XHRcdFx0Jy5wcm9maWxlLW9zcycsXG5cdFx0XHRcdFx0Jy52c2NvZGUnLFxuXHRcdFx0XHRcdCcudnNjb2RlLXRlc3QnLFxuXHRcdFx0XHRcdCdidWlsZCcsXG5cdFx0XHRcdFx0J2NsaScsXG5cdFx0XHRcdFx0J2V4dGVuc2lvbnMnLFxuXHRcdFx0XHRcdCdub2RlX21vZHVsZXMnLFxuXHRcdFx0XHRcdCdvdXQnLFxuXHRcdFx0XHRcdCdyZW1vdGUnLFxuXHRcdFx0XHRcdCdyZXNvdXJjZXMnLFxuXHRcdFx0XHRcdCdzY3JpcHRzJyxcblx0XHRcdFx0XHQnc3JjJyxcblx0XHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdCksXG5cdFx0XHRcdC4uLmNyZWF0ZUZpbGVJdGVtcyhcblx0XHRcdFx0XHQnX19pbml0X18ucHknLFxuXHRcdFx0XHRcdCcuZWRpdG9yY29uZmlnJyxcblx0XHRcdFx0XHQnLmVzbGludC1pZ25vcmUnLFxuXHRcdFx0XHRcdCcuZ2l0LWJsYW1lLWlnbm9yZS1yZXZzJyxcblx0XHRcdFx0XHQnLmdpdGF0dHJpYnV0ZXMnLFxuXHRcdFx0XHRcdCcuZ2l0aWdub3JlJyxcblx0XHRcdFx0XHQnLmxzaWZyYy5qc29uJyxcblx0XHRcdFx0XHQnLm1haWxtYXAnLFxuXHRcdFx0XHRcdCcubWVudGlvbi1ib3QnLFxuXHRcdFx0XHRcdCcubnBtcmMnLFxuXHRcdFx0XHRcdCcubnZtcmMnLFxuXHRcdFx0XHRcdCcudnNjb2RlLXRlc3QuanMnLFxuXHRcdFx0XHRcdCdjZ2xpY2Vuc2VzLmpzb24nLFxuXHRcdFx0XHRcdCdjZ21hbmlmZXN0Lmpzb24nLFxuXHRcdFx0XHRcdCdDb2RlUUwueW1sJyxcblx0XHRcdFx0XHQnQ09OVFJJQlVUSU5HLm1kJyxcblx0XHRcdFx0XHQnZXNsaW50LmNvbmZpZy5qcycsXG5cdFx0XHRcdFx0J2d1bHBmaWxlLmpzJyxcblx0XHRcdFx0XHQnTElDRU5TRS50eHQnLFxuXHRcdFx0XHRcdCdwYWNrYWdlLWxvY2suanNvbicsXG5cdFx0XHRcdFx0J3BhY2thZ2UuanNvbicsXG5cdFx0XHRcdFx0J3Byb2R1Y3QuanNvbicsXG5cdFx0XHRcdFx0J1JFQURNRS5tZCcsXG5cdFx0XHRcdFx0J1NFQ1VSSVRZLm1kJyxcblx0XHRcdFx0XHQnVGhpcmRQYXJ0eU5vdGljZXMudHh0Jyxcblx0XHRcdFx0XHQndHNmbXQuanNvbicsXG5cdFx0XHRcdClcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCcnLCAwKSk7XG5cdFx0XHRhc3NlcnRJdGVtcyhtb2RlbCwgW1xuXHRcdFx0XHQnLmJ1aWxkJyxcblx0XHRcdFx0J2J1aWxkJyxcblx0XHRcdFx0J2NnbGljZW5zZXMuanNvbicsXG5cdFx0XHRcdCdjZ21hbmlmZXN0Lmpzb24nLFxuXHRcdFx0XHQnY2xpJyxcblx0XHRcdFx0J0NvZGVRTC55bWwnLFxuXHRcdFx0XHQnLmNvbmZpZ3VyYXRpb25zJyxcblx0XHRcdFx0J0NPTlRSSUJVVElORy5tZCcsXG5cdFx0XHRcdCcuZGV2Y29udGFpbmVyJyxcblx0XHRcdFx0Jy5lZGl0b3Jjb25maWcnLFxuXHRcdFx0XHQnZXNsaW50LmNvbmZpZy5qcycsXG5cdFx0XHRcdCcuZXNsaW50LWlnbm9yZScsXG5cdFx0XHRcdCcuZXNsaW50LXBsdWdpbi1sb2NhbCcsXG5cdFx0XHRcdCdleHRlbnNpb25zJyxcblx0XHRcdFx0Jy5naXRhdHRyaWJ1dGVzJyxcblx0XHRcdFx0Jy5naXQtYmxhbWUtaWdub3JlLXJldnMnLFxuXHRcdFx0XHQnLmdpdGh1YicsXG5cdFx0XHRcdCcuZ2l0aWdub3JlJyxcblx0XHRcdFx0J2d1bHBmaWxlLmpzJyxcblx0XHRcdFx0J0xJQ0VOU0UudHh0Jyxcblx0XHRcdFx0Jy5sc2lmcmMuanNvbicsXG5cdFx0XHRcdCcubWFpbG1hcCcsXG5cdFx0XHRcdCcubWVudGlvbi1ib3QnLFxuXHRcdFx0XHQnbm9kZV9tb2R1bGVzJyxcblx0XHRcdFx0Jy5ucG1yYycsXG5cdFx0XHRcdCcubnZtcmMnLFxuXHRcdFx0XHQnb3V0Jyxcblx0XHRcdFx0J3BhY2thZ2UuanNvbicsXG5cdFx0XHRcdCdwYWNrYWdlLWxvY2suanNvbicsXG5cdFx0XHRcdCdwcm9kdWN0Lmpzb24nLFxuXHRcdFx0XHQnLnByb2ZpbGUtb3NzJyxcblx0XHRcdFx0J1JFQURNRS5tZCcsXG5cdFx0XHRcdCdyZW1vdGUnLFxuXHRcdFx0XHQncmVzb3VyY2VzJyxcblx0XHRcdFx0J3NjcmlwdHMnLFxuXHRcdFx0XHQnU0VDVVJJVFkubWQnLFxuXHRcdFx0XHQnc3JjJyxcblx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHQnVGhpcmRQYXJ0eU5vdGljZXMudHh0Jyxcblx0XHRcdFx0J3RzZm10Lmpzb24nLFxuXHRcdFx0XHQnLnZzY29kZScsXG5cdFx0XHRcdCcudnNjb2RlLXRlc3QnLFxuXHRcdFx0XHQnLnZzY29kZS10ZXN0LmpzJyxcblx0XHRcdFx0J19faW5pdF9fLnB5Jyxcblx0XHRcdFx0J19fcHljYWNoZScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1B1bmN0dWF0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3B1bmN0dWF0aW9uIGNoYXJzIHNob3VsZCBiZSBiZWxvdyBvdGhlciBtZXRob2RzJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJ2EnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICdiJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnLCcgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJzsnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICc6JyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnYycgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJ1snIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICcuLi4nIH0pLFxuXHRcdFx0XTtcblx0XHRcdG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGl0ZW1zLCBuZXcgTGluZUNvbnRleHQoJycsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbJ2EnLCAnYicsICdjJywgJywnLCAnOycsICc6JywgJ1snLCAnLi4uJ10pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3B1bmN0dWF0aW9uIGNoYXJzIHNob3VsZCBiZSBiZWxvdyBvdGhlciBmaWxlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICcuLicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJy4uLicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJy4uLycgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJy4vYS8nIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICcuL2IvJyB9KSxcblx0XHRcdF07XG5cdFx0XHRtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCcnLCAwKSk7XG5cdFx0XHRhc3NlcnRJdGVtcyhtb2RlbCwgWycuL2EvJywgJy4vYi8nLCAnLi4nLCAnLi4uJywgJy4uLyddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lubGluZSBjb21wbGV0aW9ucycsICgpID0+IHtcblx0XHRmdW5jdGlvbiBjcmVhdGVJdGVtcyhraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5JbmxpbmVTdWdnZXN0aW9uIHwgVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbkFsd2F5c09uVG9wKSB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHQuLi5jcmVhdGVGb2xkZXJJdGVtcygnYScsICdjJyksXG5cdFx0XHRcdC4uLmNyZWF0ZUZpbGVJdGVtcygnYicsICdkJyksXG5cdFx0XHRcdG5ldyBUZXJtaW5hbENvbXBsZXRpb25JdGVtKHtcblx0XHRcdFx0XHRsYWJlbDogJ2FiJyxcblx0XHRcdFx0XHRwcm92aWRlcjogJ2NvcmUnLFxuXHRcdFx0XHRcdHJlcGxhY2VtZW50UmFuZ2U6IFswLCAwXSxcblx0XHRcdFx0XHRraW5kXG5cdFx0XHRcdH0pXG5cdFx0XHRdO1xuXHRcdH1cblx0XHRzdWl0ZSgnSW5saW5lU3VnZ2VzdGlvbicsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCBwdXQgb24gdG9wIGdlbmVyYWxseScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoY3JlYXRlSXRlbXMoVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbiksIG5ldyBMaW5lQ29udGV4dCgnJywgMCkpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChtb2RlbC5pdGVtc1swXS5jb21wbGV0aW9uLmxhYmVsLCAnYWInKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIE5PVCBwdXQgb24gdG9wIHdoZW4gdGhlcmVcXCdzIGFuIGV4YWN0IG1hdGNoIG9mIGFub3RoZXIgaXRlbScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoY3JlYXRlSXRlbXMoVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbiksIG5ldyBMaW5lQ29udGV4dCgnYScsIDApKTtcblx0XHRcdFx0bm90U3RyaWN0RXF1YWwobW9kZWwuaXRlbXNbMF0uY29tcGxldGlvbi5sYWJlbCwgJ2FiJyk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzFdLmNvbXBsZXRpb24ubGFiZWwsICdhYicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ0lubGluZVN1Z2dlc3Rpb25BbHdheXNPblRvcCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCBwdXQgb24gdG9wIGdlbmVyYWxseScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoY3JlYXRlSXRlbXMoVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbkFsd2F5c09uVG9wKSwgbmV3IExpbmVDb250ZXh0KCcnLCAwKSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzBdLmNvbXBsZXRpb24ubGFiZWwsICdhYicpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgcHV0IG9uIHRvcCBldmVuIGlmIHRoZXJlXFwncyBhbiBleGFjdCBtYXRjaCBvZiBhbm90aGVyIGl0ZW0nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGNyZWF0ZUl0ZW1zKFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLklubGluZVN1Z2dlc3Rpb25BbHdheXNPblRvcCksIG5ldyBMaW5lQ29udGV4dCgnYScsIDApKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwobW9kZWwuaXRlbXNbMF0uY29tcGxldGlvbi5sYWJlbCwgJ2FiJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHRzdWl0ZSgnZ2l0IGJyYW5jaCBwcmlvcml0eSBzb3J0aW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBwcmlvcml0aXplIG1haW4gYW5kIG1hc3RlciBicmFuY2hlcyBmb3IgZ2l0IGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdmZWF0dXJlLWJyYW5jaCcgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdtYXN0ZXInIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnZGV2ZWxvcG1lbnQnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFpbicgfSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCdnaXQgY2hlY2tvdXQgJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFsnbWFpbicsICdtYXN0ZXInLCAnZGV2ZWxvcG1lbnQnLCAnZmVhdHVyZS1icmFuY2gnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJpb3JpdGl6ZSBtYWluIGFuZCBtYXN0ZXIgYnJhbmNoZXMgZm9yIGdpdCBzd2l0Y2ggY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnZmVhdHVyZS1icmFuY2gnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFpbicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdhbm90aGVyLWZlYXR1cmUnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFzdGVyJyB9KVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGl0ZW1zLCBuZXcgTGluZUNvbnRleHQoJ2dpdCBzd2l0Y2ggJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFsnbWFpbicsICdtYXN0ZXInLCAnYW5vdGhlci1mZWF0dXJlJywgJ2ZlYXR1cmUtYnJhbmNoJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBwcmlvcml0aXplIG1haW4gYW5kIG1hc3RlciBmb3Igbm9uLWdpdCBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnZmVhdHVyZS1icmFuY2gnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFzdGVyJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21haW4nIH0pXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoaXRlbXMsIG5ldyBMaW5lQ29udGV4dCgnbHMgJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFsnZmVhdHVyZS1icmFuY2gnLCAnbWFpbicsICdtYXN0ZXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGdpdCBjb21tYW5kcyB3aXRoIGxlYWRpbmcgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnZmVhdHVyZS1icmFuY2gnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFzdGVyJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21haW4nIH0pXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoaXRlbXMsIG5ldyBMaW5lQ29udGV4dCgnICBnaXQgY2hlY2tvdXQgJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFsnbWFpbicsICdtYXN0ZXInLCAnZmVhdHVyZS1icmFuY2gnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd29yayB3aXRoIGNvbXBsZXggbGFiZWwgb2JqZWN0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiB7IGxhYmVsOiAnZmVhdHVyZS1icmFuY2gnLCBkZXNjcmlwdGlvbjogJ0ZlYXR1cmUgYnJhbmNoJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiB7IGxhYmVsOiAnbWFzdGVyJywgZGVzY3JpcHRpb246ICdNYXN0ZXIgYnJhbmNoJyB9IH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiB7IGxhYmVsOiAnbWFpbicsIGRlc2NyaXB0aW9uOiAnTWFpbiBicmFuY2gnIH0gfSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCdnaXQgY2hlY2tvdXQgJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFtcblx0XHRcdFx0eyBsYWJlbDogJ21haW4nLCBkZXNjcmlwdGlvbjogJ01haW4gYnJhbmNoJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnbWFzdGVyJywgZGVzY3JpcHRpb246ICdNYXN0ZXIgYnJhbmNoJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnZmVhdHVyZS1icmFuY2gnLCBkZXNjcmlwdGlvbjogJ0ZlYXR1cmUgYnJhbmNoJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHByaW9yaXRpemUgYnJhbmNoZXMgd2l0aCBzaW1pbGFyIG5hbWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdtYWlubGluZScgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdtYXN0ZXJwaWVjZScgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdtYWluJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21hc3RlcicgfSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCdnaXQgY2hlY2tvdXQgJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFsnbWFpbicsICdtYXN0ZXInLCAnbWFpbmxpbmUnLCAnbWFzdGVycGllY2UnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHJpb3JpdGl6ZSBmb3IgZ2l0IGJyYW5jaCAtZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFpbicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdtYXN0ZXInIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnZGV2JyB9KVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGl0ZW1zLCBuZXcgTGluZUNvbnRleHQoJ2dpdCBicmFuY2ggLWQgJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFsnbWFpbicsICdtYXN0ZXInLCAnZGV2J10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbWl4ZWQga2luZCBzb3J0aW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBzb3J0IGFyZ3VtZW50cyBiZWZvcmUgZmxhZ3MgYW5kIG9wdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZsYWcsIGxhYmVsOiAnLS12ZXJib3NlJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLk9wdGlvbiwgbGFiZWw6ICctLWNvbmZpZycgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICd2YWx1ZTInIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAndmFsdWUxJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZsYWcsIGxhYmVsOiAnLS1hbGwnIH0pLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGl0ZW1zLCBuZXcgTGluZUNvbnRleHQoJ2NtZCAnLCAwKSk7XG5cdFx0XHRhc3NlcnRJdGVtcyhtb2RlbCwgWyd2YWx1ZTEnLCAndmFsdWUyJywgJy0tYWxsJywgJy0tY29uZmlnJywgJy0tdmVyYm9zZSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzb3J0IGJ5IGtpbmQgaGllcmFyY2h5OiBtZXRob2RzL2FsaWFzZXMsIGFyZ3VtZW50cywgb3RoZXJzLCBmaWxlcy9mb2xkZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlLCBsYWJlbDogJ2ZpbGUudHh0JyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZsYWcsIGxhYmVsOiAnLS1mbGFnJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ2FyZycgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5NZXRob2QsIGxhYmVsOiAnbWV0aG9kJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlciwgbGFiZWw6ICdmb2xkZXIvJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLk9wdGlvbiwgbGFiZWw6ICctLW9wdGlvbicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5BbGlhcywgbGFiZWw6ICdhbGlhcycgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5TeW1ib2xpY0xpbmtGaWxlLCBsYWJlbDogJ2ZpbGUyLnR4dCcgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5TeW1ib2xpY0xpbmtGb2xkZXIsIGxhYmVsOiAnZm9sZGVyMi8nIH0pLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGl0ZW1zLCBuZXcgTGluZUNvbnRleHQoJycsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbJ2FsaWFzJywgJ21ldGhvZCcsICdhcmcnLCAnLS1mbGFnJywgJy0tb3B0aW9uJywgJ2ZpbGUyLnR4dCcsICdmaWxlLnR4dCcsICdmb2xkZXIvJywgJ2ZvbGRlcjIvJ10pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFVBQVUsZ0JBQWdCLG1CQUFtQjtBQUNwRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdCQUF3QixrQ0FBNEQ7QUFHN0YsU0FBUyxXQUFXLFNBQStEO0FBQ2xGLFNBQU8sSUFBSSx1QkFBdUI7QUFBQSxJQUNqQyxHQUFHO0FBQUEsSUFDSCxNQUFNLFFBQVEsUUFBUSwyQkFBMkI7QUFBQSxJQUNqRCxPQUFPLFFBQVEsU0FBUztBQUFBLElBQ3hCLFVBQVUsUUFBUSxZQUFZO0FBQUEsSUFDOUIsa0JBQWtCLFFBQVEsb0JBQW9CLENBQUMsR0FBRyxDQUFDO0FBQUEsRUFDcEQsQ0FBQztBQUNGO0FBRUEsU0FBUyxtQkFBbUIsUUFBNEM7QUFDdkUsU0FBTyxPQUFPLElBQUksV0FBUyxXQUFXLEVBQUUsT0FBTyxNQUFNLDJCQUEyQixLQUFLLENBQUMsQ0FBQztBQUN4RjtBQUVBLFNBQVMsd0JBQXdCLFFBQTJDO0FBQzNFLFNBQU8sSUFBSTtBQUFBLElBQ1YsZ0JBQWdCLEdBQUcsTUFBTTtBQUFBLElBQ3pCLElBQUksWUFBWSxJQUFJLENBQUM7QUFBQSxFQUN0QjtBQUNEO0FBRUEsU0FBUyxxQkFBcUIsUUFBNEM7QUFDekUsU0FBTyxP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
