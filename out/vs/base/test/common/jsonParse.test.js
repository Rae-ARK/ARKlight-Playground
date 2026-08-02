import assert from "assert";
import { parse, stripComments } from "../../common/jsonc.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("JSON Parse", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Line comment", () => {
    const content = [
      "{",
      '  "prop": 10 // a comment',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "prop": 10 ',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Line comment - EOF", () => {
    const content = [
      "{",
      "}",
      "// a comment"
    ].join("\n");
    const expected = [
      "{",
      "}",
      ""
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Line comment - \\r\\n", () => {
    const content = [
      "{",
      '  "prop": 10 // a comment',
      "}"
    ].join("\r\n");
    const expected = [
      "{",
      '  "prop": 10 ',
      "}"
    ].join("\r\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Line comment - EOF - \\r\\n", () => {
    const content = [
      "{",
      "}",
      "// a comment"
    ].join("\r\n");
    const expected = [
      "{",
      "}",
      ""
    ].join("\r\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Block comment - single line", () => {
    const content = [
      "{",
      '  /* before */"prop": 10/* after */',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "prop": 10',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Block comment - multi line", () => {
    const content = [
      "{",
      "  /**",
      "   * Some comment",
      "   */",
      '  "prop": 10',
      "}"
    ].join("\n");
    const expected = [
      "{",
      "  ",
      '  "prop": 10',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Block comment - shortest match", () => {
    const content = "/* abc */ */";
    const expected = " */";
    assert.strictEqual(stripComments(content), expected);
  });
  test("No strings - double quote", () => {
    const content = [
      "{",
      '  "/* */": 10',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "/* */": 10',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("No strings - single quote", () => {
    const content = [
      "{",
      `  '/* */': 10`,
      "}"
    ].join("\n");
    const expected = [
      "{",
      `  '/* */': 10`,
      "}"
    ].join("\n");
    assert.strictEqual(stripComments(content), expected);
  });
  test("Trailing comma in object", () => {
    const content = [
      "{",
      `  "a": 10,`,
      "}"
    ].join("\n");
    const expected = [
      "{",
      `  "a": 10`,
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Trailing comma in array", () => {
    const content = [
      `[ "a", "b", "c", ]`
    ].join("\n");
    const expected = [
      `[ "a", "b", "c" ]`
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Trailing comma", () => {
    const content = [
      "{",
      '  "propA": 10, // a comment',
      '  "propB": false, // a trailing comma',
      "}"
    ].join("\n");
    const expected = [
      "{",
      '  "propA": 10,',
      '  "propB": false',
      "}"
    ].join("\n");
    assert.deepEqual(parse(content), JSON.parse(expected));
  });
  test("Trailing comma - EOF", () => {
    const content = `
// This configuration file allows you to pass permanent command line arguments to VS Code.
// Only a subset of arguments is currently supported to reduce the likelihood of breaking
// the installation.
//
// PLEASE DO NOT CHANGE WITHOUT UNDERSTANDING THE IMPACT
//
// NOTE: Changing this file requires a restart of VS Code.
{
	// Use software rendering instead of hardware accelerated rendering.
	// This can help in cases where you see rendering issues in VS Code.
	// "disable-hardware-acceleration": true,
	// Allows to disable crash reporting.
	// Should restart the app if the value is changed.
	"enable-crash-reporter": true,
	// Unique id used for correlating crash reports sent from this instance.
	// Do not edit this value.
	"crash-reporter-id": "aaaaab31-7453-4506-97d0-93411b2c21c7",
	"locale": "en",
	// "log-level": "trace"
}
`;
    assert.deepEqual(parse(content), {
      "enable-crash-reporter": true,
      "crash-reporter-id": "aaaaab31-7453-4506-97d0-93411b2c21c7",
      "locale": "en"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vanNvblBhcnNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuXG5pbXBvcnQgeyBwYXJzZSwgc3RyaXBDb21tZW50cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9qc29uYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuc3VpdGUoJ0pTT04gUGFyc2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0xpbmUgY29tbWVudCcsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnICBcInByb3BcIjogMTAgLy8gYSBjb21tZW50Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJwcm9wXCI6IDEwICcsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHBhcnNlKGNvbnRlbnQpLCBKU09OLnBhcnNlKGV4cGVjdGVkKSk7XG5cdH0pO1xuXHR0ZXN0KCdMaW5lIGNvbW1lbnQgLSBFT0YnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0J30nLFxuXHRcdFx0Jy8vIGEgY29tbWVudCdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0J30nLFxuXHRcdFx0Jydcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocGFyc2UoY29udGVudCksIEpTT04ucGFyc2UoZXhwZWN0ZWQpKTtcblx0fSk7XG5cdHRlc3QoJ0xpbmUgY29tbWVudCAtIFxcXFxyXFxcXG4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJwcm9wXCI6IDEwIC8vIGEgY29tbWVudCcsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXHJcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwicHJvcFwiOiAxMCAnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxyXFxuJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChwYXJzZShjb250ZW50KSwgSlNPTi5wYXJzZShleHBlY3RlZCkpO1xuXHR9KTtcblx0dGVzdCgnTGluZSBjb21tZW50IC0gRU9GIC0gXFxcXHJcXFxcbicsICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnfScsXG5cdFx0XHQnLy8gYSBjb21tZW50J1xuXHRcdF0uam9pbignXFxyXFxuJyk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHQneycsXG5cdFx0XHQnfScsXG5cdFx0XHQnJ1xuXHRcdF0uam9pbignXFxyXFxuJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChwYXJzZShjb250ZW50KSwgSlNPTi5wYXJzZShleHBlY3RlZCkpO1xuXHR9KTtcblx0dGVzdCgnQmxvY2sgY29tbWVudCAtIHNpbmdsZSBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIC8qIGJlZm9yZSAqL1wicHJvcFwiOiAxMC8qIGFmdGVyICovJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJwcm9wXCI6IDEwJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocGFyc2UoY29udGVudCksIEpTT04ucGFyc2UoZXhwZWN0ZWQpKTtcblx0fSk7XG5cdHRlc3QoJ0Jsb2NrIGNvbW1lbnQgLSBtdWx0aSBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIC8qKicsXG5cdFx0XHQnICAgKiBTb21lIGNvbW1lbnQnLFxuXHRcdFx0JyAgICovJyxcblx0XHRcdCcgIFwicHJvcFwiOiAxMCcsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgICcsXG5cdFx0XHQnICBcInByb3BcIjogMTAnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChwYXJzZShjb250ZW50KSwgSlNPTi5wYXJzZShleHBlY3RlZCkpO1xuXHR9KTtcblx0dGVzdCgnQmxvY2sgY29tbWVudCAtIHNob3J0ZXN0IG1hdGNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnLyogYWJjICovICovJztcblx0XHRjb25zdCBleHBlY3RlZCA9ICcgKi8nO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpcENvbW1lbnRzKGNvbnRlbnQpLCBleHBlY3RlZCk7XG5cdH0pO1xuXHR0ZXN0KCdObyBzdHJpbmdzIC0gZG91YmxlIHF1b3RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwiLyogKi9cIjogMTAnLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZDogc3RyaW5nID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCIvKiAqL1wiOiAxMCcsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGFzc2VydC5kZWVwRXF1YWwocGFyc2UoY29udGVudCksIEpTT04ucGFyc2UoZXhwZWN0ZWQpKTtcblx0fSk7XG5cdHRlc3QoJ05vIHN0cmluZ3MgLSBzaW5nbGUgcXVvdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0YCAgJy8qICovJzogMTBgLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZDogc3RyaW5nID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0YCAgJy8qICovJzogMTBgLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaXBDb21tZW50cyhjb250ZW50KSwgZXhwZWN0ZWQpO1xuXHR9KTtcblx0dGVzdCgnVHJhaWxpbmcgY29tbWEgaW4gb2JqZWN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdGAgIFwiYVwiOiAxMCxgLFxuXHRcdFx0J30nXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBleHBlY3RlZDogc3RyaW5nID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0YCAgXCJhXCI6IDEwYCxcblx0XHRcdCd9J1xuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChwYXJzZShjb250ZW50KSwgSlNPTi5wYXJzZShleHBlY3RlZCkpO1xuXHR9KTtcblx0dGVzdCgnVHJhaWxpbmcgY29tbWEgaW4gYXJyYXknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nID0gW1xuXHRcdFx0YFsgXCJhXCIsIFwiYlwiLCBcImNcIiwgXWBcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGV4cGVjdGVkOiBzdHJpbmcgPSBbXG5cdFx0XHRgWyBcImFcIiwgXCJiXCIsIFwiY1wiIF1gXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHBhcnNlKGNvbnRlbnQpLCBKU09OLnBhcnNlKGV4cGVjdGVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RyYWlsaW5nIGNvbW1hJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZyA9IFtcblx0XHRcdCd7Jyxcblx0XHRcdCcgIFwicHJvcEFcIjogMTAsIC8vIGEgY29tbWVudCcsXG5cdFx0XHQnICBcInByb3BCXCI6IGZhbHNlLCAvLyBhIHRyYWlsaW5nIGNvbW1hJyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0J3snLFxuXHRcdFx0JyAgXCJwcm9wQVwiOiAxMCwnLFxuXHRcdFx0JyAgXCJwcm9wQlwiOiBmYWxzZScsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHBhcnNlKGNvbnRlbnQpLCBKU09OLnBhcnNlKGV4cGVjdGVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RyYWlsaW5nIGNvbW1hIC0gRU9GJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBgXG4vLyBUaGlzIGNvbmZpZ3VyYXRpb24gZmlsZSBhbGxvd3MgeW91IHRvIHBhc3MgcGVybWFuZW50IGNvbW1hbmQgbGluZSBhcmd1bWVudHMgdG8gVlMgQ29kZS5cbi8vIE9ubHkgYSBzdWJzZXQgb2YgYXJndW1lbnRzIGlzIGN1cnJlbnRseSBzdXBwb3J0ZWQgdG8gcmVkdWNlIHRoZSBsaWtlbGlob29kIG9mIGJyZWFraW5nXG4vLyB0aGUgaW5zdGFsbGF0aW9uLlxuLy9cbi8vIFBMRUFTRSBETyBOT1QgQ0hBTkdFIFdJVEhPVVQgVU5ERVJTVEFORElORyBUSEUgSU1QQUNUXG4vL1xuLy8gTk9URTogQ2hhbmdpbmcgdGhpcyBmaWxlIHJlcXVpcmVzIGEgcmVzdGFydCBvZiBWUyBDb2RlLlxue1xuXHQvLyBVc2Ugc29mdHdhcmUgcmVuZGVyaW5nIGluc3RlYWQgb2YgaGFyZHdhcmUgYWNjZWxlcmF0ZWQgcmVuZGVyaW5nLlxuXHQvLyBUaGlzIGNhbiBoZWxwIGluIGNhc2VzIHdoZXJlIHlvdSBzZWUgcmVuZGVyaW5nIGlzc3VlcyBpbiBWUyBDb2RlLlxuXHQvLyBcImRpc2FibGUtaGFyZHdhcmUtYWNjZWxlcmF0aW9uXCI6IHRydWUsXG5cdC8vIEFsbG93cyB0byBkaXNhYmxlIGNyYXNoIHJlcG9ydGluZy5cblx0Ly8gU2hvdWxkIHJlc3RhcnQgdGhlIGFwcCBpZiB0aGUgdmFsdWUgaXMgY2hhbmdlZC5cblx0XCJlbmFibGUtY3Jhc2gtcmVwb3J0ZXJcIjogdHJ1ZSxcblx0Ly8gVW5pcXVlIGlkIHVzZWQgZm9yIGNvcnJlbGF0aW5nIGNyYXNoIHJlcG9ydHMgc2VudCBmcm9tIHRoaXMgaW5zdGFuY2UuXG5cdC8vIERvIG5vdCBlZGl0IHRoaXMgdmFsdWUuXG5cdFwiY3Jhc2gtcmVwb3J0ZXItaWRcIjogXCJhYWFhYWIzMS03NDUzLTQ1MDYtOTdkMC05MzQxMWIyYzIxYzdcIixcblx0XCJsb2NhbGVcIjogXCJlblwiLFxuXHQvLyBcImxvZy1sZXZlbFwiOiBcInRyYWNlXCJcbn1cbmA7XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbChwYXJzZShjb250ZW50KSwge1xuXHRcdFx0J2VuYWJsZS1jcmFzaC1yZXBvcnRlcic6IHRydWUsXG5cdFx0XHQnY3Jhc2gtcmVwb3J0ZXItaWQnOiAnYWFhYWFiMzEtNzQ1My00NTA2LTk3ZDAtOTM0MTFiMmMyMWM3Jyxcblx0XHRcdCdsb2NhbGUnOiAnZW4nXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxPQUFPLHFCQUFxQjtBQUNyQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGNBQWMsTUFBTTtBQUN6QiwwQ0FBd0M7QUFFeEMsT0FBSyxnQkFBZ0IsTUFBTTtBQUMxQixVQUFNLFVBQWtCO0FBQUEsTUFDdkI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFdBQU8sVUFBVSxNQUFNLE9BQU8sR0FBRyxLQUFLLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDdEQsQ0FBQztBQUNELE9BQUssc0JBQXNCLE1BQU07QUFDaEMsVUFBTSxVQUFrQjtBQUFBLE1BQ3ZCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsVUFBTSxXQUFXO0FBQUEsTUFDaEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUk7QUFDWCxXQUFPLFVBQVUsTUFBTSxPQUFPLEdBQUcsS0FBSyxNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQ3RELENBQUM7QUFDRCxPQUFLLHlCQUF5QixNQUFNO0FBQ25DLFVBQU0sVUFBa0I7QUFBQSxNQUN2QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtB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
