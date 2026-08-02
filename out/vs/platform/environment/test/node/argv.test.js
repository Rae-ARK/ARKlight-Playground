import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { formatOptions, parseArgs } from "../../node/argv.js";
import { addArg } from "../../node/argvHelper.js";
function o(description, type = "string") {
  return {
    description,
    type
  };
}
function c(description, options) {
  return {
    description,
    type: "subcommand",
    options
  };
}
suite("formatOptions", () => {
  test("Text should display small columns correctly", () => {
    assert.deepStrictEqual(
      formatOptions({
        "add": o("bar")
      }, 80),
      ["  --add        bar"]
    );
    assert.deepStrictEqual(
      formatOptions({
        "add": o("bar"),
        "wait": o("ba"),
        "trace": o("b")
      }, 80),
      [
        "  --add        bar",
        "  --wait       ba",
        "  --trace      b"
      ]
    );
  });
  test("Text should wrap", () => {
    assert.deepStrictEqual(
      formatOptions({
        // eslint-disable-next-line local/code-no-any-casts
        "add": o("bar ".repeat(9))
      }, 40),
      [
        "  --add        bar bar bar bar bar bar",
        "               bar bar bar"
      ]
    );
  });
  test("Text should revert to the condensed view when the terminal is too narrow", () => {
    assert.deepStrictEqual(
      formatOptions({
        // eslint-disable-next-line local/code-no-any-casts
        "add": o("bar ".repeat(9))
      }, 30),
      [
        "  --add",
        "      bar bar bar bar bar bar bar bar bar "
      ]
    );
  });
  test("addArg", () => {
    assert.deepStrictEqual(addArg([], "foo"), ["foo"]);
    assert.deepStrictEqual(addArg([], "foo", "bar"), ["foo", "bar"]);
    assert.deepStrictEqual(addArg(["foo"], "bar"), ["foo", "bar"]);
    assert.deepStrictEqual(addArg(["--wait"], "bar"), ["--wait", "bar"]);
    assert.deepStrictEqual(addArg(["--wait", "--", "--foo"], "bar"), ["--wait", "bar", "--", "--foo"]);
    assert.deepStrictEqual(addArg(["--", "--foo"], "bar"), ["bar", "--", "--foo"]);
  });
  test("subcommands", () => {
    assert.deepStrictEqual(
      formatOptions({
        "testcmd": c("A test command", { add: o("A test command option") })
      }, 30),
      [
        "  --testcmd",
        "      A test command"
      ]
    );
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
suite("parseArgs", () => {
  function newErrorReporter(result = [], command = "") {
    const commandPrefix = command ? command + "-" : "";
    return {
      onDeprecatedOption: (deprecatedId) => result.push(`${commandPrefix}onDeprecatedOption ${deprecatedId}`),
      onUnknownOption: (id) => result.push(`${commandPrefix}onUnknownOption ${id}`),
      onEmptyValue: (id) => result.push(`${commandPrefix}onEmptyValue ${id}`),
      onMultipleValues: (id, usedValue) => result.push(`${commandPrefix}onMultipleValues ${id} ${usedValue}`),
      getSubcommandReporter: (c2) => newErrorReporter(result, commandPrefix + c2),
      result
    };
  }
  function assertParse(options, input, expected, expectedErrors) {
    const errorReporter = newErrorReporter();
    assert.deepStrictEqual(parseArgs(input, options, errorReporter), expected);
    assert.deepStrictEqual(errorReporter.result, expectedErrors);
  }
  test("subcommands", () => {
    const options1 = {
      "testcmd": c("A test command", {
        testArg: o("A test command option"),
        _: { type: "string[]" }
      }),
      _: { type: "string[]" }
    };
    assertParse(
      options1,
      ["testcmd", "--testArg=foo"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      []
    );
    assertParse(
      options1,
      ["testcmd", "--testArg=foo", "--testX"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      ["testcmd-onUnknownOption testX"]
    );
    assertParse(
      options1,
      ["--testArg=foo", "testcmd", "--testX"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      ["testcmd-onUnknownOption testX"]
    );
    assertParse(
      options1,
      ["--testArg=foo", "testcmd"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      []
    );
    assertParse(
      options1,
      ["--testArg", "foo", "testcmd"],
      { testcmd: { testArg: "foo", "_": [] }, "_": [] },
      []
    );
    const options2 = {
      "testcmd": c("A test command", {
        testArg: o("A test command option")
      }),
      testX: { type: "boolean", global: true, description: "" },
      _: { type: "string[]" }
    };
    assertParse(
      options2,
      ["testcmd", "--testArg=foo", "--testX"],
      { testcmd: { testArg: "foo", testX: true, "_": [] }, "_": [] },
      []
    );
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Vudmlyb25tZW50L3Rlc3Qvbm9kZS9hcmd2LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGZvcm1hdE9wdGlvbnMsIE9wdGlvbiwgT3B0aW9uRGVzY3JpcHRpb25zLCBTdWJjb21tYW5kLCBwYXJzZUFyZ3MsIEVycm9yUmVwb3J0ZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FyZ3YuanMnO1xuaW1wb3J0IHsgYWRkQXJnIH0gZnJvbSAnLi4vLi4vbm9kZS9hcmd2SGVscGVyLmpzJztcblxuZnVuY3Rpb24gbyhkZXNjcmlwdGlvbjogc3RyaW5nLCB0eXBlOiAnYm9vbGVhbicgfCAnc3RyaW5nJyB8ICdzdHJpbmdbXScgPSAnc3RyaW5nJyk6IE9wdGlvbjxhbnk+IHtcblx0cmV0dXJuIHtcblx0XHRkZXNjcmlwdGlvbiwgdHlwZVxuXHR9O1xufVxuZnVuY3Rpb24gYyhkZXNjcmlwdGlvbjogc3RyaW5nLCBvcHRpb25zOiBPcHRpb25EZXNjcmlwdGlvbnM8YW55Pik6IFN1YmNvbW1hbmQ8YW55PiB7XG5cdHJldHVybiB7XG5cdFx0ZGVzY3JpcHRpb24sIHR5cGU6ICdzdWJjb21tYW5kJywgb3B0aW9uc1xuXHR9O1xufVxuXG5zdWl0ZSgnZm9ybWF0T3B0aW9ucycsICgpID0+IHtcblxuXHR0ZXN0KCdUZXh0IHNob3VsZCBkaXNwbGF5IHNtYWxsIGNvbHVtbnMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRmb3JtYXRPcHRpb25zKHtcblx0XHRcdFx0J2FkZCc6IG8oJ2JhcicpXG5cdFx0XHR9LCA4MCksXG5cdFx0XHRbJyAgLS1hZGQgICAgICAgIGJhciddXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Zm9ybWF0T3B0aW9ucyh7XG5cdFx0XHRcdCdhZGQnOiBvKCdiYXInKSxcblx0XHRcdFx0J3dhaXQnOiBvKCdiYScpLFxuXHRcdFx0XHQndHJhY2UnOiBvKCdiJylcblx0XHRcdH0sIDgwKSxcblx0XHRcdFtcblx0XHRcdFx0JyAgLS1hZGQgICAgICAgIGJhcicsXG5cdFx0XHRcdCcgIC0td2FpdCAgICAgICBiYScsXG5cdFx0XHRcdCcgIC0tdHJhY2UgICAgICBiJ1xuXHRcdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RleHQgc2hvdWxkIHdyYXAnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGZvcm1hdE9wdGlvbnMoe1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0J2FkZCc6IG8oKDxhbnk+J2JhciAnKS5yZXBlYXQoOSkpXG5cdFx0XHR9LCA0MCksXG5cdFx0XHRbXG5cdFx0XHRcdCcgIC0tYWRkICAgICAgICBiYXIgYmFyIGJhciBiYXIgYmFyIGJhcicsXG5cdFx0XHRcdCcgICAgICAgICAgICAgICBiYXIgYmFyIGJhcidcblx0XHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXh0IHNob3VsZCByZXZlcnQgdG8gdGhlIGNvbmRlbnNlZCB2aWV3IHdoZW4gdGhlIHRlcm1pbmFsIGlzIHRvbyBuYXJyb3cnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGZvcm1hdE9wdGlvbnMoe1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0J2FkZCc6IG8oKDxhbnk+J2JhciAnKS5yZXBlYXQoOSkpXG5cdFx0XHR9LCAzMCksXG5cdFx0XHRbXG5cdFx0XHRcdCcgIC0tYWRkJyxcblx0XHRcdFx0JyAgICAgIGJhciBiYXIgYmFyIGJhciBiYXIgYmFyIGJhciBiYXIgYmFyICdcblx0XHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRBcmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGRBcmcoW10sICdmb28nKSwgWydmb28nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZGRBcmcoW10sICdmb28nLCAnYmFyJyksIFsnZm9vJywgJ2JhciddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkZEFyZyhbJ2ZvbyddLCAnYmFyJyksIFsnZm9vJywgJ2JhciddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkZEFyZyhbJy0td2FpdCddLCAnYmFyJyksIFsnLS13YWl0JywgJ2JhciddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkZEFyZyhbJy0td2FpdCcsICctLScsICctLWZvbyddLCAnYmFyJyksIFsnLS13YWl0JywgJ2JhcicsICctLScsICctLWZvbyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkZEFyZyhbJy0tJywgJy0tZm9vJ10sICdiYXInKSwgWydiYXInLCAnLS0nLCAnLS1mb28nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YmNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRmb3JtYXRPcHRpb25zKHtcblx0XHRcdFx0J3Rlc3RjbWQnOiBjKCdBIHRlc3QgY29tbWFuZCcsIHsgYWRkOiBvKCdBIHRlc3QgY29tbWFuZCBvcHRpb24nKSB9KVxuXHRcdFx0fSwgMzApLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAtLXRlc3RjbWQnLFxuXHRcdFx0XHQnICAgICAgQSB0ZXN0IGNvbW1hbmQnXG5cdFx0XHRdKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcblxuc3VpdGUoJ3BhcnNlQXJncycsICgpID0+IHtcblx0ZnVuY3Rpb24gbmV3RXJyb3JSZXBvcnRlcihyZXN1bHQ6IHN0cmluZ1tdID0gW10sIGNvbW1hbmQgPSAnJyk6IEVycm9yUmVwb3J0ZXIgJiB7IHJlc3VsdDogc3RyaW5nW10gfSB7XG5cdFx0Y29uc3QgY29tbWFuZFByZWZpeCA9IGNvbW1hbmQgPyBjb21tYW5kICsgJy0nIDogJyc7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9uRGVwcmVjYXRlZE9wdGlvbjogKGRlcHJlY2F0ZWRJZCkgPT4gcmVzdWx0LnB1c2goYCR7Y29tbWFuZFByZWZpeH1vbkRlcHJlY2F0ZWRPcHRpb24gJHtkZXByZWNhdGVkSWR9YCksXG5cdFx0XHRvblVua25vd25PcHRpb246IChpZCkgPT4gcmVzdWx0LnB1c2goYCR7Y29tbWFuZFByZWZpeH1vblVua25vd25PcHRpb24gJHtpZH1gKSxcblx0XHRcdG9uRW1wdHlWYWx1ZTogKGlkKSA9PiByZXN1bHQucHVzaChgJHtjb21tYW5kUHJlZml4fW9uRW1wdHlWYWx1ZSAke2lkfWApLFxuXHRcdFx0b25NdWx0aXBsZVZhbHVlczogKGlkLCB1c2VkVmFsdWUpID0+IHJlc3VsdC5wdXNoKGAke2NvbW1hbmRQcmVmaXh9b25NdWx0aXBsZVZhbHVlcyAke2lkfSAke3VzZWRWYWx1ZX1gKSxcblx0XHRcdGdldFN1YmNvbW1hbmRSZXBvcnRlcjogKGMpID0+IG5ld0Vycm9yUmVwb3J0ZXIocmVzdWx0LCBjb21tYW5kUHJlZml4ICsgYyksXG5cdFx0XHRyZXN1bHRcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0UGFyc2U8VD4ob3B0aW9uczogT3B0aW9uRGVzY3JpcHRpb25zPFQ+LCBpbnB1dDogc3RyaW5nW10sIGV4cGVjdGVkOiBULCBleHBlY3RlZEVycm9yczogc3RyaW5nW10pIHtcblx0XHRjb25zdCBlcnJvclJlcG9ydGVyID0gbmV3RXJyb3JSZXBvcnRlcigpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VBcmdzKGlucHV0LCBvcHRpb25zLCBlcnJvclJlcG9ydGVyKSwgZXhwZWN0ZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXJyb3JSZXBvcnRlci5yZXN1bHQsIGV4cGVjdGVkRXJyb3JzKTtcblx0fVxuXG5cdHRlc3QoJ3N1YmNvbW1hbmRzJywgKCkgPT4ge1xuXG5cdFx0aW50ZXJmYWNlIFRlc3RBcmdzMSB7XG5cdFx0XHR0ZXN0Y21kPzoge1xuXHRcdFx0XHR0ZXN0QXJnPzogc3RyaW5nO1xuXHRcdFx0XHRfOiBzdHJpbmdbXTtcblx0XHRcdH07XG5cdFx0XHRfOiBzdHJpbmdbXTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zMSA9IHtcblx0XHRcdCd0ZXN0Y21kJzogYygnQSB0ZXN0IGNvbW1hbmQnLCB7XG5cdFx0XHRcdHRlc3RBcmc6IG8oJ0EgdGVzdCBjb21tYW5kIG9wdGlvbicpLFxuXHRcdFx0XHRfOiB7IHR5cGU6ICdzdHJpbmdbXScgfVxuXHRcdFx0fSksXG5cdFx0XHRfOiB7IHR5cGU6ICdzdHJpbmdbXScgfVxuXHRcdH0gYXMgT3B0aW9uRGVzY3JpcHRpb25zPFRlc3RBcmdzMT47XG5cdFx0YXNzZXJ0UGFyc2UoXG5cdFx0XHRvcHRpb25zMSxcblx0XHRcdFsndGVzdGNtZCcsICctLXRlc3RBcmc9Zm9vJ10sXG5cdFx0XHR7IHRlc3RjbWQ6IHsgdGVzdEFyZzogJ2ZvbycsICdfJzogW10gfSwgJ18nOiBbXSB9LFxuXHRcdFx0W11cblx0XHQpO1xuXHRcdGFzc2VydFBhcnNlKFxuXHRcdFx0b3B0aW9uczEsXG5cdFx0XHRbJ3Rlc3RjbWQnLCAnLS10ZXN0QXJnPWZvbycsICctLXRlc3RYJ10sXG5cdFx0XHR7IHRlc3RjbWQ6IHsgdGVzdEFyZzogJ2ZvbycsICdfJzogW10gfSwgJ18nOiBbXSB9LFxuXHRcdFx0Wyd0ZXN0Y21kLW9uVW5rbm93bk9wdGlvbiB0ZXN0WCddXG5cdFx0KTtcblxuXHRcdGFzc2VydFBhcnNlKFxuXHRcdFx0b3B0aW9uczEsXG5cdFx0XHRbJy0tdGVzdEFyZz1mb28nLCAndGVzdGNtZCcsICctLXRlc3RYJ10sXG5cdFx0XHR7IHRlc3RjbWQ6IHsgdGVzdEFyZzogJ2ZvbycsICdfJzogW10gfSwgJ18nOiBbXSB9LFxuXHRcdFx0Wyd0ZXN0Y21kLW9uVW5rbm93bk9wdGlvbiB0ZXN0WCddXG5cdFx0KTtcblxuXHRcdGFzc2VydFBhcnNlKFxuXHRcdFx0b3B0aW9uczEsXG5cdFx0XHRbJy0tdGVzdEFyZz1mb28nLCAndGVzdGNtZCddLFxuXHRcdFx0eyB0ZXN0Y21kOiB7IHRlc3RBcmc6ICdmb28nLCAnXyc6IFtdIH0sICdfJzogW10gfSxcblx0XHRcdFtdXG5cdFx0KTtcblxuXHRcdGFzc2VydFBhcnNlKFxuXHRcdFx0b3B0aW9uczEsXG5cdFx0XHRbJy0tdGVzdEFyZycsICdmb28nLCAndGVzdGNtZCddLFxuXHRcdFx0eyB0ZXN0Y21kOiB7IHRlc3RBcmc6ICdmb28nLCAnXyc6IFtdIH0sICdfJzogW10gfSxcblx0XHRcdFtdXG5cdFx0KTtcblxuXHRcdGludGVyZmFjZSBUZXN0QXJnczIge1xuXHRcdFx0dGVzdGNtZD86IHtcblx0XHRcdFx0dGVzdEFyZz86IHN0cmluZztcblx0XHRcdFx0dGVzdFg/OiBib29sZWFuO1xuXHRcdFx0XHRfOiBzdHJpbmdbXTtcblx0XHRcdH07XG5cdFx0XHR0ZXN0WD86IGJvb2xlYW47XG5cdFx0XHRfOiBzdHJpbmdbXTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zMiA9IHtcblx0XHRcdCd0ZXN0Y21kJzogYygnQSB0ZXN0IGNvbW1hbmQnLCB7XG5cdFx0XHRcdHRlc3RBcmc6IG8oJ0EgdGVzdCBjb21tYW5kIG9wdGlvbicpXG5cdFx0XHR9KSxcblx0XHRcdHRlc3RYOiB7IHR5cGU6ICdib29sZWFuJywgZ2xvYmFsOiB0cnVlLCBkZXNjcmlwdGlvbjogJycgfSxcblx0XHRcdF86IHsgdHlwZTogJ3N0cmluZ1tdJyB9XG5cdFx0fSBhcyBPcHRpb25EZXNjcmlwdGlvbnM8VGVzdEFyZ3MyPjtcblx0XHRhc3NlcnRQYXJzZShcblx0XHRcdG9wdGlvbnMyLFxuXHRcdFx0Wyd0ZXN0Y21kJywgJy0tdGVzdEFyZz1mb28nLCAnLS10ZXN0WCddLFxuXHRcdFx0eyB0ZXN0Y21kOiB7IHRlc3RBcmc6ICdmb28nLCB0ZXN0WDogdHJ1ZSwgJ18nOiBbXSB9LCAnXyc6IFtdIH0sXG5cdFx0XHRbXVxuXHRcdCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxlQUF1RCxpQkFBZ0M7QUFDaEcsU0FBUyxjQUFjO0FBRXZCLFNBQVMsRUFBRSxhQUFxQixPQUEwQyxVQUF1QjtBQUNoRyxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQWE7QUFBQSxFQUNkO0FBQ0Q7QUFDQSxTQUFTLEVBQUUsYUFBcUIsU0FBbUQ7QUFDbEYsU0FBTztBQUFBLElBQ047QUFBQSxJQUFhLE1B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
