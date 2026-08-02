import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Parser } from "../../common/contextkey.js";
function parseToStr(input) {
  const parser = new Parser();
  const prints = [];
  const print = (...ss) => {
    ss.forEach((s) => prints.push(s));
  };
  const expr = parser.parse(input);
  if (expr === void 0) {
    if (parser.lexingErrors.length > 0) {
      print("Lexing errors:", "\n\n");
      parser.lexingErrors.forEach((lexingError) => print(`Unexpected token '${lexingError.lexeme}' at offset ${lexingError.offset}. ${lexingError.additionalInfo}`, "\n"));
    }
    if (parser.parsingErrors.length > 0) {
      if (parser.lexingErrors.length > 0) {
        print("\n --- \n");
      }
      print("Parsing errors:", "\n\n");
      parser.parsingErrors.forEach((parsingError) => print(`Unexpected '${parsingError.lexeme}' at offset ${parsingError.offset}.`, "\n"));
    }
  } else {
    print(expr.serialize());
  }
  return prints.join("");
}
suite("Context Key Parser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test(" foo", () => {
    const input = " foo";
    assert.deepStrictEqual(parseToStr(input), "foo");
  });
  test("!foo", () => {
    const input = "!foo";
    assert.deepStrictEqual(parseToStr(input), "!foo");
  });
  test("foo =~ /bar/", () => {
    const input = "foo =~ /bar/";
    assert.deepStrictEqual(parseToStr(input), "foo =~ /bar/");
  });
  test(`foo || (foo =~ /bar/ && baz)`, () => {
    const input = `foo || (foo =~ /bar/ && baz)`;
    assert.deepStrictEqual(parseToStr(input), "foo || baz && foo =~ /bar/");
  });
  test("foo || (foo =~ /bar/ || baz)", () => {
    const input = "foo || (foo =~ /bar/ || baz)";
    assert.deepStrictEqual(parseToStr(input), "baz || foo || foo =~ /bar/");
  });
  test(`(foo || bar) && (jee || jar)`, () => {
    const input = `(foo || bar) && (jee || jar)`;
    assert.deepStrictEqual(parseToStr(input), "bar && jar || bar && jee || foo && jar || foo && jee");
  });
  test("foo && foo =~ /zee/i", () => {
    const input = "foo && foo =~ /zee/i";
    assert.deepStrictEqual(parseToStr(input), "foo && foo =~ /zee/i");
  });
  test("foo.bar==enabled", () => {
    const input = "foo.bar==enabled";
    assert.deepStrictEqual(parseToStr(input), `foo.bar == 'enabled'`);
  });
  test(`foo.bar == 'enabled'`, () => {
    const input = `foo.bar == 'enabled'`;
    assert.deepStrictEqual(parseToStr(input), `foo.bar == 'enabled'`);
  });
  test("foo.bar:zed==completed - equality with no space", () => {
    const input = "foo.bar:zed==completed";
    assert.deepStrictEqual(parseToStr(input), `foo.bar:zed == 'completed'`);
  });
  test("a && b || c", () => {
    const input = "a && b || c";
    assert.deepStrictEqual(parseToStr(input), "c || a && b");
  });
  test("fooBar && baz.jar && fee.bee<K-loo+1>", () => {
    const input = "fooBar && baz.jar && fee.bee<K-loo+1>";
    assert.deepStrictEqual(parseToStr(input), "baz.jar && fee.bee<K-loo+1> && fooBar");
  });
  test("foo.barBaz<C-r> < 2", () => {
    const input = "foo.barBaz<C-r> < 2";
    assert.deepStrictEqual(parseToStr(input), `foo.barBaz<C-r> < 2`);
  });
  test("foo.bar >= -1", () => {
    const input = "foo.bar >= -1";
    assert.deepStrictEqual(parseToStr(input), "foo.bar >= -1");
  });
  test(`key contains &nbsp: view == vsc-packages-activitybar-folders\xA0&& vsc-packages-folders-loaded`, () => {
    const input = `view == vsc-packages-activitybar-folders\xA0&& vsc-packages-folders-loaded`;
    assert.deepStrictEqual(parseToStr(input), `vsc-packages-folders-loaded && view == 'vsc-packages-activitybar-folders'`);
  });
  test("foo.bar <= -1", () => {
    const input = "foo.bar <= -1";
    assert.deepStrictEqual(parseToStr(input), `foo.bar <= -1`);
  });
  test("!cmake:hideBuildCommand && cmake:enableFullFeatureSet", () => {
    const input = "!cmake:hideBuildCommand && cmake:enableFullFeatureSet";
    assert.deepStrictEqual(parseToStr(input), "cmake:enableFullFeatureSet && !cmake:hideBuildCommand");
  });
  test("!(foo && bar)", () => {
    const input = "!(foo && bar)";
    assert.deepStrictEqual(parseToStr(input), "!bar || !foo");
  });
  test("!(foo && bar || boar) || deer", () => {
    const input = "!(foo && bar || boar) || deer";
    assert.deepStrictEqual(parseToStr(input), "deer || !bar && !boar || !boar && !foo");
  });
  test(`!(!foo)`, () => {
    const input = `!(!foo)`;
    assert.deepStrictEqual(parseToStr(input), "foo");
  });
  suite("controversial", () => {
    test(`debugState == "stopped"`, () => {
      const input = `debugState == "stopped"`;
      assert.deepStrictEqual(parseToStr(input), `debugState == '"stopped"'`);
    });
    test(` viewItem == VSCode WorkSpace`, () => {
      const input = ` viewItem == VSCode WorkSpace`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected 'WorkSpace' at offset 20.
`);
    });
  });
  suite("regex", () => {
    test(`resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`, () => {
      const input = `resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`;
      assert.deepStrictEqual(parseToStr(input), "resource =~ /\\/foo\\/(barr|door\\/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(\\/.*)*$/");
    });
    test(`resource =~ /((/scratch/(?!update)(.*)/)|((/src/).*/)).*$/`, () => {
      const input = `resource =~ /((/scratch/(?!update)(.*)/)|((/src/).*/)).*$/`;
      assert.deepStrictEqual(parseToStr(input), "resource =~ /((\\/scratch\\/(?!update)(.*)\\/)|((\\/src\\/).*\\/)).*$/");
    });
    test(`resourcePath =~ /.md(.yml|.txt)*$/giym`, () => {
      const input = `resourcePath =~ /.md(.yml|.txt)*$/giym`;
      assert.deepStrictEqual(parseToStr(input), "resourcePath =~ /.md(.yml|.txt)*$/im");
    });
  });
  suite("error handling", () => {
    test(`/foo`, () => {
      const input = `/foo`;
      assert.deepStrictEqual(parseToStr(input), `Lexing errors:

Unexpected token '/foo' at offset 0. Did you forget to escape the '/' (slash) character? Put two backslashes before it to escape, e.g., '\\\\/'.

 --- 
Parsing errors:

Unexpected '/foo' at offset 0.
`);
    });
    test(`!b == 'true'`, () => {
      const input = `!b == 'true'`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected '==' at offset 3.
`);
    });
    test("!foo &&  in bar", () => {
      const input = "!foo &&  in bar";
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected 'in' at offset 9.
`);
    });
    test("vim<c-r> == 1 && vim<2<=3", () => {
      const input = "vim<c-r> == 1 && vim<2<=3";
      assert.deepStrictEqual(parseToStr(input), `Lexing errors:

Unexpected token '=' at offset 23. Did you mean == or =~?

 --- 
Parsing errors:

Unexpected '=' at offset 23.
`);
    });
    test(`foo && 'bar`, () => {
      const input = `foo && 'bar`;
      assert.deepStrictEqual(parseToStr(input), `Lexing errors:

Unexpected token ''bar' at offset 7. Did you forget to open or close the quote?

 --- 
Parsing errors:

Unexpected ''bar' at offset 7.
`);
    });
    test(`config.foo &&  &&bar =~ /^foo$|^bar-foo$|^joo$|^jar$/ && !foo`, () => {
      const input = `config.foo &&  &&bar =~ /^foo$|^bar-foo$|^joo$|^jar$/ && !foo`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected '&&' at offset 15.
`);
    });
    test(`!foo == 'test'`, () => {
      const input = `!foo == 'test'`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected '==' at offset 5.
`);
    });
    test(`!!foo`, function() {
      const input = `!!foo`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected '!' at offset 1.
`);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbnRleHRrZXkvdGVzdC9jb21tb24vcGFyc2VyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQYXJzZXIgfSBmcm9tICcuLi8uLi9jb21tb24vY29udGV4dGtleS5qcyc7XG5cbmZ1bmN0aW9uIHBhcnNlVG9TdHIoaW5wdXQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHBhcnNlciA9IG5ldyBQYXJzZXIoKTtcblxuXHRjb25zdCBwcmludHM6IHN0cmluZ1tdID0gW107XG5cblx0Y29uc3QgcHJpbnQgPSAoLi4uc3M6IHN0cmluZ1tdKSA9PiB7IHNzLmZvckVhY2gocyA9PiBwcmludHMucHVzaChzKSk7IH07XG5cblx0Y29uc3QgZXhwciA9IHBhcnNlci5wYXJzZShpbnB1dCk7XG5cdGlmIChleHByID09PSB1bmRlZmluZWQpIHtcblx0XHRpZiAocGFyc2VyLmxleGluZ0Vycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRwcmludCgnTGV4aW5nIGVycm9yczonLCAnXFxuXFxuJyk7XG5cdFx0XHRwYXJzZXIubGV4aW5nRXJyb3JzLmZvckVhY2gobGV4aW5nRXJyb3IgPT4gcHJpbnQoYFVuZXhwZWN0ZWQgdG9rZW4gJyR7bGV4aW5nRXJyb3IubGV4ZW1lfScgYXQgb2Zmc2V0ICR7bGV4aW5nRXJyb3Iub2Zmc2V0fS4gJHtsZXhpbmdFcnJvci5hZGRpdGlvbmFsSW5mb31gLCAnXFxuJykpO1xuXHRcdH1cblxuXHRcdGlmIChwYXJzZXIucGFyc2luZ0Vycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAocGFyc2VyLmxleGluZ0Vycm9ycy5sZW5ndGggPiAwKSB7IHByaW50KCdcXG4gLS0tIFxcbicpOyB9XG5cdFx0XHRwcmludCgnUGFyc2luZyBlcnJvcnM6JywgJ1xcblxcbicpO1xuXHRcdFx0cGFyc2VyLnBhcnNpbmdFcnJvcnMuZm9yRWFjaChwYXJzaW5nRXJyb3IgPT4gcHJpbnQoYFVuZXhwZWN0ZWQgJyR7cGFyc2luZ0Vycm9yLmxleGVtZX0nIGF0IG9mZnNldCAke3BhcnNpbmdFcnJvci5vZmZzZXR9LmAsICdcXG4nKSk7XG5cdFx0fVxuXG5cdH0gZWxzZSB7XG5cdFx0cHJpbnQoZXhwci5zZXJpYWxpemUoKSk7XG5cdH1cblxuXHRyZXR1cm4gcHJpbnRzLmpvaW4oJycpO1xufVxuXG5zdWl0ZSgnQ29udGV4dCBLZXkgUGFyc2VyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJyBmb28nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnIGZvbyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJ2ZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KCchZm9vJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJyFmb28nO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICchZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbyA9fiAvYmFyLycsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdmb28gPX4gL2Jhci8nO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdmb28gPX4gL2Jhci8nKTtcblx0fSk7XG5cblx0dGVzdChgZm9vIHx8IChmb28gPX4gL2Jhci8gJiYgYmF6KWAsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9IGBmb28gfHwgKGZvbyA9fiAvYmFyLyAmJiBiYXopYDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAnZm9vIHx8IGJheiAmJiBmb28gPX4gL2Jhci8nKTtcblx0fSk7XG5cblx0dGVzdCgnZm9vIHx8IChmb28gPX4gL2Jhci8gfHwgYmF6KScsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdmb28gfHwgKGZvbyA9fiAvYmFyLyB8fCBiYXopJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAnYmF6IHx8IGZvbyB8fCBmb28gPX4gL2Jhci8nKTtcblx0fSk7XG5cblx0dGVzdChgKGZvbyB8fCBiYXIpICYmIChqZWUgfHwgamFyKWAsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9IGAoZm9vIHx8IGJhcikgJiYgKGplZSB8fCBqYXIpYDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAnYmFyICYmIGphciB8fCBiYXIgJiYgamVlIHx8IGZvbyAmJiBqYXIgfHwgZm9vICYmIGplZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb28gJiYgZm9vID1+IC96ZWUvaScsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdmb28gJiYgZm9vID1+IC96ZWUvaSc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJ2ZvbyAmJiBmb28gPX4gL3plZS9pJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvby5iYXI9PWVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnZm9vLmJhcj09ZW5hYmxlZCc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYGZvby5iYXIgPT0gJ2VuYWJsZWQnYCk7XG5cdH0pO1xuXG5cdHRlc3QoYGZvby5iYXIgPT0gJ2VuYWJsZWQnYCwgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gYGZvby5iYXIgPT0gJ2VuYWJsZWQnYDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgZm9vLmJhciA9PSAnZW5hYmxlZCdgKTtcblx0fSk7XG5cblx0dGVzdCgnZm9vLmJhcjp6ZWQ9PWNvbXBsZXRlZCAtIGVxdWFsaXR5IHdpdGggbm8gc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnZm9vLmJhcjp6ZWQ9PWNvbXBsZXRlZCc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYGZvby5iYXI6emVkID09ICdjb21wbGV0ZWQnYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgJiYgYiB8fCBjJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJ2EgJiYgYiB8fCBjJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAnYyB8fCBhICYmIGInKTtcblx0fSk7XG5cblx0dGVzdCgnZm9vQmFyICYmIGJhei5qYXIgJiYgZmVlLmJlZTxLLWxvbysxPicsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdmb29CYXIgJiYgYmF6LmphciAmJiBmZWUuYmVlPEstbG9vKzE+Jztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAnYmF6LmphciAmJiBmZWUuYmVlPEstbG9vKzE+ICYmIGZvb0JhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb28uYmFyQmF6PEMtcj4gPCAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJ2Zvby5iYXJCYXo8Qy1yPiA8IDInO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksIGBmb28uYmFyQmF6PEMtcj4gPCAyYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvby5iYXIgPj0gLTEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnZm9vLmJhciA+PSAtMSc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJ2Zvby5iYXIgPj0gLTEnKTtcblx0fSk7XG5cblx0dGVzdChga2V5IGNvbnRhaW5zICZuYnNwOiB2aWV3ID09IHZzYy1wYWNrYWdlcy1hY3Rpdml0eWJhci1mb2xkZXJzXHUwMEEwJiYgdnNjLXBhY2thZ2VzLWZvbGRlcnMtbG9hZGVkYCwgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gYHZpZXcgPT0gdnNjLXBhY2thZ2VzLWFjdGl2aXR5YmFyLWZvbGRlcnNcdTAwQTAmJiB2c2MtcGFja2FnZXMtZm9sZGVycy1sb2FkZWRgO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksIGB2c2MtcGFja2FnZXMtZm9sZGVycy1sb2FkZWQgJiYgdmlldyA9PSAndnNjLXBhY2thZ2VzLWFjdGl2aXR5YmFyLWZvbGRlcnMnYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvby5iYXIgPD0gLTEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnZm9vLmJhciA8PSAtMSc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYGZvby5iYXIgPD0gLTFgKTtcblx0fSk7XG5cblx0dGVzdCgnIWNtYWtlOmhpZGVCdWlsZENvbW1hbmQgXFx1MDAyNlxcdTAwMjYgY21ha2U6ZW5hYmxlRnVsbEZlYXR1cmVTZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnIWNtYWtlOmhpZGVCdWlsZENvbW1hbmQgXFx1MDAyNlxcdTAwMjYgY21ha2U6ZW5hYmxlRnVsbEZlYXR1cmVTZXQnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdjbWFrZTplbmFibGVGdWxsRmVhdHVyZVNldCAmJiAhY21ha2U6aGlkZUJ1aWxkQ29tbWFuZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCchKGZvbyAmJiBiYXIpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJyEoZm9vICYmIGJhciknO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICchYmFyIHx8ICFmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnIShmb28gJiYgYmFyIHx8IGJvYXIpIHx8IGRlZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnIShmb28gJiYgYmFyIHx8IGJvYXIpIHx8IGRlZXInO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdkZWVyIHx8ICFiYXIgJiYgIWJvYXIgfHwgIWJvYXIgJiYgIWZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KGAhKCFmb28pYCwgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gYCEoIWZvbylgO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdmb28nKTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbnRyb3ZlcnNpYWwnLCAoKSA9PiB7XG5cdFx0Lypcblx0XHRcdG5ldyBwYXJzZXIgS0VFUFMgb2xkIG9uZSdzIGJlaGF2aW9yOlxuXG5cdFx0XHRvbGQgcGFyc2VyIG91dHB1dDogeyBrZXk6ICdkZWJ1Z1N0YXRlJywgb3A6ICc9PScsIHZhbHVlOiAnXCJzdG9wcGVkXCInIH1cblx0XHRcdG5ldyBwYXJzZXIgb3V0cHV0OiB7IGtleTogJ2RlYnVnU3RhdGUnLCBvcDogJz09JywgdmFsdWU6ICdcInN0b3BwZWRcIicgfVxuXG5cdFx0XHRUT0RPQHVsdWdiZWtuYTogd2Ugc2hvdWxkIGNvbnNpZGVyIGJyZWFraW5nIG9sZCBwYXJzZXIncyBiZWhhdmlvciwgYW5kIG5vdCB0YWtlIGRvdWJsZSBxdW90ZXMgYXMgcGFydCBvZiB0aGUgYHZhbHVlYCBiZWNhdXNlIHRoYXQncyBub3Qgd2hhdCB1c2VyIGV4cGVjdHMuXG5cdFx0Ki9cblx0XHR0ZXN0KGBkZWJ1Z1N0YXRlID09IFwic3RvcHBlZFwiYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgZGVidWdTdGF0ZSA9PSBcInN0b3BwZWRcImA7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgZGVidWdTdGF0ZSA9PSAnXCJzdG9wcGVkXCInYCk7XG5cdFx0fSk7XG5cblx0XHQvKlxuXHRcdFx0bmV3IHBhcnNlciBCUkVBS1Mgb2xkIG9uZSdzIGJlaGF2aW9yOlxuXG5cdFx0XHRvbGQgcGFyc2VyIG91dHB1dDogeyBrZXk6ICd2aWV3SXRlbScsIG9wOiAnPT0nLCB2YWx1ZTogJ1ZTQ29kZSBXb3JrU3BhY2UnIH1cblx0XHRcdG5ldyBwYXJzZXIgb3V0cHV0OiB7IGtleTogJ3ZpZXdJdGVtJywgb3A6ICc9PScsIHZhbHVlOiAnVlNDb2RlJyB9XG5cblx0XHRcdFRPRE9AdWx1Z2Jla25hOiBzaW5jZSB0aGlzJ3MgYnJlYWtpbmcsIHdlIGNhbiBoYXZlIGhhY2t5IGNvZGUgdGhhdCB0cmllcyBkZXRlY3Rpbmcgc3VjaCBjYXNlcyBhbmQgcmVwbGljYXRlIG9sZCBwYXJzZXIncyBiZWhhdmlvci5cblx0XHQqL1xuXHRcdHRlc3QoYCB2aWV3SXRlbSA9PSBWU0NvZGUgV29ya1NwYWNlYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgIHZpZXdJdGVtID09IFZTQ29kZSBXb3JrU3BhY2VgO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYFBhcnNpbmcgZXJyb3JzOlxcblxcblVuZXhwZWN0ZWQgJ1dvcmtTcGFjZScgYXQgb2Zmc2V0IDIwLlxcbmApO1xuXHRcdH0pO1xuXG5cblx0fSk7XG5cblx0c3VpdGUoJ3JlZ2V4JywgKCkgPT4ge1xuXG5cdFx0dGVzdChgcmVzb3VyY2UgPX4gLy9mb28vKGJhcnJ8ZG9vci8oRm9vLUJhciUyMFRlbXBsYXRlc3xTb28lMjBMb29vKXxXZWIlMjBTaXRlJUpqaiUyMExsbGwpKC8uKikqJC9gLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGByZXNvdXJjZSA9fiAvL2Zvby8oYmFycnxkb29yLyhGb28tQmFyJTIwVGVtcGxhdGVzfFNvbyUyMExvb28pfFdlYiUyMFNpdGUlSmpqJTIwTGxsbCkoLy4qKSokL2A7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAncmVzb3VyY2UgPX4gL1xcXFwvZm9vXFxcXC8oYmFycnxkb29yXFxcXC8oRm9vLUJhciUyMFRlbXBsYXRlc3xTb28lMjBMb29vKXxXZWIlMjBTaXRlJUpqaiUyMExsbGwpKFxcXFwvLiopKiQvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KGByZXNvdXJjZSA9fiAvKCgvc2NyYXRjaC8oPyF1cGRhdGUpKC4qKS8pfCgoL3NyYy8pLiovKSkuKiQvYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgcmVzb3VyY2UgPX4gLygoL3NjcmF0Y2gvKD8hdXBkYXRlKSguKikvKXwoKC9zcmMvKS4qLykpLiokL2A7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAncmVzb3VyY2UgPX4gLygoXFxcXC9zY3JhdGNoXFxcXC8oPyF1cGRhdGUpKC4qKVxcXFwvKXwoKFxcXFwvc3JjXFxcXC8pLipcXFxcLykpLiokLycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdChgcmVzb3VyY2VQYXRoID1+IC9cXC5tZChcXC55bWx8XFwudHh0KSokL2dpeW1gLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGByZXNvdXJjZVBhdGggPX4gL1xcLm1kKFxcLnltbHxcXC50eHQpKiQvZ2l5bWA7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAncmVzb3VyY2VQYXRoID1+IC8ubWQoLnltbHwudHh0KSokL2ltJyk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0c3VpdGUoJ2Vycm9yIGhhbmRsaW5nJywgKCkgPT4ge1xuXG5cdFx0dGVzdChgL2Zvb2AsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYC9mb29gO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYExleGluZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCB0b2tlbiAnL2ZvbycgYXQgb2Zmc2V0IDAuIERpZCB5b3UgZm9yZ2V0IHRvIGVzY2FwZSB0aGUgJy8nIChzbGFzaCkgY2hhcmFjdGVyPyBQdXQgdHdvIGJhY2tzbGFzaGVzIGJlZm9yZSBpdCB0byBlc2NhcGUsIGUuZy4sICdcXFxcXFxcXC8nLlxcblxcbiAtLS0gXFxuUGFyc2luZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCAnL2ZvbycgYXQgb2Zmc2V0IDAuXFxuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KGAhYiA9PSAndHJ1ZSdgLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGAhYiA9PSAndHJ1ZSdgO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYFBhcnNpbmcgZXJyb3JzOlxcblxcblVuZXhwZWN0ZWQgJz09JyBhdCBvZmZzZXQgMy5cXG5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJyFmb28gJiYgIGluIGJhcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJyFmb28gJiYgIGluIGJhcic7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgUGFyc2luZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCAnaW4nIGF0IG9mZnNldCA5LlxcbmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmltPGMtcj4gPT0gMSAmJiB2aW08Mjw9MycsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gJ3ZpbTxjLXI+ID09IDEgJiYgdmltPDI8PTMnO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYExleGluZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCB0b2tlbiAnPScgYXQgb2Zmc2V0IDIzLiBEaWQgeW91IG1lYW4gPT0gb3IgPX4/XFxuXFxuIC0tLSBcXG5QYXJzaW5nIGVycm9yczpcXG5cXG5VbmV4cGVjdGVkICc9JyBhdCBvZmZzZXQgMjMuXFxuYCk7IC8vIEZJWE1FXG5cdFx0fSk7XG5cblx0XHR0ZXN0KGBmb28gJiYgJ2JhcmAsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYGZvbyAmJiAnYmFyYDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksIGBMZXhpbmcgZXJyb3JzOlxcblxcblVuZXhwZWN0ZWQgdG9rZW4gJydiYXInIGF0IG9mZnNldCA3LiBEaWQgeW91IGZvcmdldCB0byBvcGVuIG9yIGNsb3NlIHRoZSBxdW90ZT9cXG5cXG4gLS0tIFxcblBhcnNpbmcgZXJyb3JzOlxcblxcblVuZXhwZWN0ZWQgJydiYXInIGF0IG9mZnNldCA3LlxcbmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdChgY29uZmlnLmZvbyAmJiAgJiZiYXIgPX4gL15mb28kfF5iYXItZm9vJHxeam9vJHxeamFyJC8gJiYgIWZvb2AsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYGNvbmZpZy5mb28gJiYgICYmYmFyID1+IC9eZm9vJHxeYmFyLWZvbyR8XmpvbyR8XmphciQvICYmICFmb29gO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYFBhcnNpbmcgZXJyb3JzOlxcblxcblVuZXhwZWN0ZWQgJyYmJyBhdCBvZmZzZXQgMTUuXFxuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KGAhZm9vID09ICd0ZXN0J2AsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYCFmb28gPT0gJ3Rlc3QnYDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksIGBQYXJzaW5nIGVycm9yczpcXG5cXG5VbmV4cGVjdGVkICc9PScgYXQgb2Zmc2V0IDUuXFxuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KGAhIWZvb2AsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYCEhZm9vYDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksIGBQYXJzaW5nIGVycm9yczpcXG5cXG5VbmV4cGVjdGVkICchJyBhdCBvZmZzZXQgMS5cXG5gKTtcblx0XHR9KTtcblxuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxjQUFjO0FBRXZCLFNBQVMsV0FBVyxPQUF1QjtBQUMxQyxRQUFNLFNBQVMsSUFBSSxPQUFPO0FBRTFCLFFBQU0sU0FBbUIsQ0FBQztBQUUxQixRQUFNLFFBQVEsSUFBSSxPQUFpQjtBQUFFLE9BQUcsUUFBUSxPQUFLLE9BQU8sS0FBSyxDQUFDLENBQUM7QUFBQSxFQUFHO0FBRXRFLFFBQU0sT0FBTyxPQUFPLE1BQU0sS0FBSztBQUMvQixNQUFJLFNBQVMsUUFBVztBQUN2QixRQUFJLE9BQU8sYUFBYSxTQUFTLEdBQUc7QUFDbkMsWUFBTSxrQkFBa0IsTUFBTTtBQUM5QixhQUFPLGFBQWEsUUFBUSxpQkFBZSxNQUFNLHFCQUFxQixZQUFZLE1BQU0sZUFB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
