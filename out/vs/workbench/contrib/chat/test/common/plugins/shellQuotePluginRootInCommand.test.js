import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { shellQuotePluginRootInCommand } from "../../../common/plugins/agentPluginServiceImpl.js";
suite("shellQuotePluginRootInCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const TOKEN = "${PLUGIN_ROOT}";
  test("returns command unchanged when token is not present", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("echo hello", "/safe/path", TOKEN),
      "echo hello"
    );
  });
  test("plain replacement when path has no special characters", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", "/safe/path", TOKEN),
      "/safe/path/run.sh"
    );
  });
  test("plain replacement for multiple occurrences with safe path", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/a && ${PLUGIN_ROOT}/b", "/safe", TOKEN),
      "/safe/a && /safe/b"
    );
  });
  test("quotes path with spaces", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", "/path with spaces", TOKEN),
      '"/path with spaces/run.sh"'
    );
  });
  test("quotes path with ampersand", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", "/path&dir", TOKEN),
      '"/path&dir/run.sh"'
    );
  });
  test("quotes multiple occurrences with unsafe path", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/a && ${PLUGIN_ROOT}/b", "/my dir", TOKEN),
      '"/my dir/a" && "/my dir/b"'
    );
  });
  test("does not double-quote when already in double quotes", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand('"${PLUGIN_ROOT}/run.sh"', "/my dir", TOKEN),
      '"/my dir/run.sh"'
    );
  });
  test("does not double-quote when already in single quotes", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand(`'\${PLUGIN_ROOT}/run.sh'`, "/my dir", TOKEN),
      `'/my dir/run.sh'`
    );
  });
  test("escapes embedded double-quote characters in path", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", '/path"with"quotes', TOKEN),
      '"/path\\"with\\"quotes/run.sh"'
    );
  });
  test("handles token without trailing path suffix", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("cd ${PLUGIN_ROOT} && run", "/my dir", TOKEN),
      'cd "/my dir" && run'
    );
  });
  test("does not consume shell operators adjacent to token", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("cd ${PLUGIN_ROOT}&& echo ok", "/my dir", TOKEN),
      'cd "/my dir"&& echo ok'
    );
  });
  test("handles token at start, middle and end of command", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/a ${PLUGIN_ROOT}/b ${PLUGIN_ROOT}/c", "/sp ace", TOKEN),
      '"/sp ace/a" "/sp ace/b" "/sp ace/c"'
    );
  });
  test("uses default CLAUDE_PLUGIN_ROOT token when not specified", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${CLAUDE_PLUGIN_ROOT}/run.sh", "/safe/path", "${CLAUDE_PLUGIN_ROOT}"),
      "/safe/path/run.sh"
    );
  });
  test("uses default CLAUDE_PLUGIN_ROOT token with quoting", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${CLAUDE_PLUGIN_ROOT}/run.sh", "/my dir", "${CLAUDE_PLUGIN_ROOT}"),
      '"/my dir/run.sh"'
    );
  });
  test("handles Windows-style paths with spaces", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}\\scripts\\run.bat", "C:\\Program Files\\plugin", TOKEN),
      '"C:\\Program Files\\plugin\\scripts\\run.bat"'
    );
  });
  test("handles path with parentheses", () => {
    assert.strictEqual(
      shellQuotePluginRootInCommand("${PLUGIN_ROOT}/run.sh", "/path(1)", TOKEN),
      '"/path(1)/run.sh"'
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcGx1Z2lucy9zaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZUltcGwuanMnO1xuXG5zdWl0ZSgnc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IFRPS0VOID0gJyR7UExVR0lOX1JPT1R9JztcblxuXHR0ZXN0KCdyZXR1cm5zIGNvbW1hbmQgdW5jaGFuZ2VkIHdoZW4gdG9rZW4gaXMgbm90IHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJ2VjaG8gaGVsbG8nLCAnL3NhZmUvcGF0aCcsIFRPS0VOKSxcblx0XHRcdCdlY2hvIGhlbGxvJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwbGFpbiByZXBsYWNlbWVudCB3aGVuIHBhdGggaGFzIG5vIHNwZWNpYWwgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCgnJHtQTFVHSU5fUk9PVH0vcnVuLnNoJywgJy9zYWZlL3BhdGgnLCBUT0tFTiksXG5cdFx0XHQnL3NhZmUvcGF0aC9ydW4uc2gnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BsYWluIHJlcGxhY2VtZW50IGZvciBtdWx0aXBsZSBvY2N1cnJlbmNlcyB3aXRoIHNhZmUgcGF0aCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCgnJHtQTFVHSU5fUk9PVH0vYSAmJiAke1BMVUdJTl9ST09UfS9iJywgJy9zYWZlJywgVE9LRU4pLFxuXHRcdFx0Jy9zYWZlL2EgJiYgL3NhZmUvYicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncXVvdGVzIHBhdGggd2l0aCBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7UExVR0lOX1JPT1R9L3J1bi5zaCcsICcvcGF0aCB3aXRoIHNwYWNlcycsIFRPS0VOKSxcblx0XHRcdCdcIi9wYXRoIHdpdGggc3BhY2VzL3J1bi5zaFwiJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdxdW90ZXMgcGF0aCB3aXRoIGFtcGVyc2FuZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCgnJHtQTFVHSU5fUk9PVH0vcnVuLnNoJywgJy9wYXRoJmRpcicsIFRPS0VOKSxcblx0XHRcdCdcIi9wYXRoJmRpci9ydW4uc2hcIicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncXVvdGVzIG11bHRpcGxlIG9jY3VycmVuY2VzIHdpdGggdW5zYWZlIHBhdGgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7UExVR0lOX1JPT1R9L2EgJiYgJHtQTFVHSU5fUk9PVH0vYicsICcvbXkgZGlyJywgVE9LRU4pLFxuXHRcdFx0J1wiL215IGRpci9hXCIgJiYgXCIvbXkgZGlyL2JcIicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZG91YmxlLXF1b3RlIHdoZW4gYWxyZWFkeSBpbiBkb3VibGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCdcIiR7UExVR0lOX1JPT1R9L3J1bi5zaFwiJywgJy9teSBkaXInLCBUT0tFTiksXG5cdFx0XHQnXCIvbXkgZGlyL3J1bi5zaFwiJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkb3VibGUtcXVvdGUgd2hlbiBhbHJlYWR5IGluIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoYCdcXCR7UExVR0lOX1JPT1R9L3J1bi5zaCdgLCAnL215IGRpcicsIFRPS0VOKSxcblx0XHRcdGAnL215IGRpci9ydW4uc2gnYCxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlc2NhcGVzIGVtYmVkZGVkIGRvdWJsZS1xdW90ZSBjaGFyYWN0ZXJzIGluIHBhdGgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7UExVR0lOX1JPT1R9L3J1bi5zaCcsICcvcGF0aFwid2l0aFwicXVvdGVzJywgVE9LRU4pLFxuXHRcdFx0J1wiL3BhdGhcXFxcXCJ3aXRoXFxcXFwicXVvdGVzL3J1bi5zaFwiJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIHRva2VuIHdpdGhvdXQgdHJhaWxpbmcgcGF0aCBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJ2NkICR7UExVR0lOX1JPT1R9ICYmIHJ1bicsICcvbXkgZGlyJywgVE9LRU4pLFxuXHRcdFx0J2NkIFwiL215IGRpclwiICYmIHJ1bicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY29uc3VtZSBzaGVsbCBvcGVyYXRvcnMgYWRqYWNlbnQgdG8gdG9rZW4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJ2NkICR7UExVR0lOX1JPT1R9JiYgZWNobyBvaycsICcvbXkgZGlyJywgVE9LRU4pLFxuXHRcdFx0J2NkIFwiL215IGRpclwiJiYgZWNobyBvaycsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyB0b2tlbiBhdCBzdGFydCwgbWlkZGxlIGFuZCBlbmQgb2YgY29tbWFuZCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCgnJHtQTFVHSU5fUk9PVH0vYSAke1BMVUdJTl9ST09UfS9iICR7UExVR0lOX1JPT1R9L2MnLCAnL3NwIGFjZScsIFRPS0VOKSxcblx0XHRcdCdcIi9zcCBhY2UvYVwiIFwiL3NwIGFjZS9iXCIgXCIvc3AgYWNlL2NcIicsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBkZWZhdWx0IENMQVVERV9QTFVHSU5fUk9PVCB0b2tlbiB3aGVuIG5vdCBzcGVjaWZpZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7Q0xBVURFX1BMVUdJTl9ST09UfS9ydW4uc2gnLCAnL3NhZmUvcGF0aCcsICcke0NMQVVERV9QTFVHSU5fUk9PVH0nKSxcblx0XHRcdCcvc2FmZS9wYXRoL3J1bi5zaCcsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBkZWZhdWx0IENMQVVERV9QTFVHSU5fUk9PVCB0b2tlbiB3aXRoIHF1b3RpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJyR7Q0xBVURFX1BMVUdJTl9ST09UfS9ydW4uc2gnLCAnL215IGRpcicsICcke0NMQVVERV9QTFVHSU5fUk9PVH0nKSxcblx0XHRcdCdcIi9teSBkaXIvcnVuLnNoXCInLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgV2luZG93cy1zdHlsZSBwYXRocyB3aXRoIHNwYWNlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzaGVsbFF1b3RlUGx1Z2luUm9vdEluQ29tbWFuZCgnJHtQTFVHSU5fUk9PVH1cXFxcc2NyaXB0c1xcXFxydW4uYmF0JywgJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxccGx1Z2luJywgVE9LRU4pLFxuXHRcdFx0J1wiQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxwbHVnaW5cXFxcc2NyaXB0c1xcXFxydW4uYmF0XCInLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgcGF0aCB3aXRoIHBhcmVudGhlc2VzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKCcke1BMVUdJTl9ST09UfS9ydW4uc2gnLCAnL3BhdGgoMSknLCBUT0tFTiksXG5cdFx0XHQnXCIvcGF0aCgxKS9ydW4uc2hcIicsXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFDQUFxQztBQUU5QyxNQUFNLGlDQUFpQyxNQUFNO0FBQzVDLDBDQUF3QztBQUV4QyxRQUFNLFFBQVE7QUFFZCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFdBQU87QUFBQSxNQUNOLDhCQUE4QixjQUFjLGNBQWMsS0FBSztBQUFBLE1BQy9EO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsV0FBTztBQUFBLE1BQ04sOEJBQThCLHlCQUF5QixjQUFjLEtBQUs7QUFBQSxNQUMxRTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFdBQU87QUFBQSxNQUNOLDhCQUE4Qix3Q0FBd0MsU0FBUyxLQUFLO0FBQUEsTUFDcEY7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyQkFBMkIsTUFBTTtBQUNyQyxXQUFPO0FBQUEsTUFDTiw4QkFBOEIseUJBQXlCLHFCQUFxQixLQUFLO0FBQUEsTUFDakY7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw4QkFBOEIsTUFBTTtBQUN4QyxXQUFPO0FBQUEsTUFDTiw4QkFBOEIseUJBQXlCLGFBQWEsS0FBSztBQUFBLE1BQ3pFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssZ0RBQWdELE1BQU07QUFDMUQsV0FBTztBQUFBLE1BQ04sOEJBQThCLHdDQUF3QyxXQUFXLEtBQUs7QUFBQSxNQUN0RjtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFdBQU87QUFBQSxNQUNOLDhCQUE4QiwyQkFBMkIsV0FBVyxLQUFLO0FBQUEsTUFDekU7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxXQUFPO0FBQUEsTUFDTiw4QkFBOEIsNEJBQTRCLFdBQVcsS0FBSztBQUFBLE1BQzFFO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQsV0FBTztBQUFBLE1BQ04sOEJBQThCLHlCQUF5QixxQkFBcUIsS0FBSztBQUFBLE1BQ2pGO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsV0FBTztBQUFBLE1BQ04sOEJBQThCLDRCQUE0QixXQUFXLEtBQUs7QUFBQSxNQUMxRTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFdBQU87QUFBQSxNQUNOLDhCQUE4QiwrQkFBK0IsV0FBVyxLQUFLO0FBQUEsTUFDN0U7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxXQUFPO0FBQUEsTUFDTiw4QkFBOEIsc0RBQXNELFdBQVcsS0FBSztBQUFBLE1BQ3BHO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssNERBQTRELE1BQU07QUFDdEUsV0FBTztBQUFBLE1BQ04sOEJBQThCLGdDQUFnQyxjQUFjLHVCQUF1QjtBQUFBLE1BQ25HO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsV0FBTztBQUFBLE1BQ04sOEJBQThCLGdDQUFnQyxXQUFXLHVCQUF1QjtBQUFBLE1BQ2hHO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMkNBQTJDLE1BQU07QUFDckQsV0FBTztBQUFBLE1BQ04sOEJBQThCLG9DQUFvQyw2QkFBNkIsS0FBSztBQUFBLE1BQ3BHO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssaUNBQWlDLE1BQU07QUFDM0MsV0FBTztBQUFBLE1BQ04sOEJBQThCLHlCQUF5QixZQUFZLEtBQUs7QUFBQSxNQUN4RTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
