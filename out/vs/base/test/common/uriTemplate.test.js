import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { UriTemplate } from "../../common/uriTemplate.js";
import * as assert from "assert";
suite("UriTemplate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testParsing(template, expectedComponents) {
    const templ = UriTemplate.parse(template);
    assert.deepStrictEqual(templ.components.filter((c) => typeof c === "object"), expectedComponents);
    return templ;
  }
  function testResolution(template, variables, expected) {
    const templ = UriTemplate.parse(template);
    const result = templ.resolve(variables);
    assert.strictEqual(result, expected);
  }
  test("simple replacement", () => {
    const templ = UriTemplate.parse("http://example.com/{var}");
    assert.deepStrictEqual(templ.components, ["http://example.com/", {
      expression: "{var}",
      operator: "",
      variables: [{ explodable: false, name: "var", optional: false, prefixLength: void 0, repeatable: false }]
    }, ""]);
    const result = templ.resolve({ var: "value" });
    assert.strictEqual(result, "http://example.com/value");
  });
  test("parsing components correctly", () => {
    testParsing("http://example.com/{var}", [{
      expression: "{var}",
      operator: "",
      variables: [{ explodable: false, name: "var", optional: false, prefixLength: void 0, repeatable: false }]
    }]);
    testParsing("http://example.com/{+path}", [{
      expression: "{+path}",
      operator: "+",
      variables: [{ explodable: false, name: "path", optional: false, prefixLength: void 0, repeatable: false }]
    }]);
    testParsing("http://example.com/{x,y}", [{
      expression: "{x,y}",
      operator: "",
      variables: [
        { explodable: false, name: "x", optional: false, prefixLength: void 0, repeatable: false },
        { explodable: false, name: "y", optional: false, prefixLength: void 0, repeatable: false }
      ]
    }]);
    testParsing("http://example.com/{var:3}", [{
      expression: "{var:3}",
      operator: "",
      variables: [{ explodable: false, name: "var", optional: false, prefixLength: 3, repeatable: false }]
    }]);
    testParsing("http://example.com/{list*}", [{
      expression: "{list*}",
      operator: "",
      variables: [{ explodable: true, name: "list", optional: false, prefixLength: void 0, repeatable: true }]
    }]);
    testParsing("http://example.com/{x}/path/{y}", [
      {
        expression: "{x}",
        operator: "",
        variables: [{ explodable: false, name: "x", optional: false, prefixLength: void 0, repeatable: false }]
      },
      {
        expression: "{y}",
        operator: "",
        variables: [{ explodable: false, name: "y", optional: false, prefixLength: void 0, repeatable: false }]
      }
    ]);
  });
  test("Level 1 - Simple string expansion", () => {
    const variables = {
      var: "value",
      hello: "Hello World!"
    };
    testResolution("{var}", variables, "value");
    testResolution("{hello}", variables, "Hello%20World%21");
  });
  test("control characters are percent-encoded with two hex digits", () => {
    testResolution("{x}", { x: "a	b" }, "a%09b");
    testResolution("{x}", { x: "\n" }, "%0A");
    testResolution("{x}", { x: "\r" }, "%0D");
  });
  test("Level 2 - Reserved expansion", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar"
    };
    testResolution("{+var}", variables, "value");
    testResolution("{+hello}", variables, "Hello%20World!");
    testResolution("{+path}/here", variables, "/foo/bar/here");
    testResolution("here?ref={+path}", variables, "here?ref=/foo/bar");
  });
  test("Level 2 - Fragment expansion", () => {
    const variables = {
      var: "value",
      hello: "Hello World!"
    };
    testResolution("X{#var}", variables, "X#value");
    testResolution("X{#hello}", variables, "X#Hello%20World!");
  });
  test("Level 3 - String expansion with multiple variables", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      empty: "",
      path: "/foo/bar",
      x: "1024",
      y: "768"
    };
    testResolution("map?{x,y}", variables, "map?1024,768");
    testResolution("{x,hello,y}", variables, "1024,Hello%20World%21,768");
  });
  test("Level 3 - Reserved expansion with multiple variables", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      x: "1024",
      y: "768"
    };
    testResolution("{+x,hello,y}", variables, "1024,Hello%20World!,768");
    testResolution("{+path,x}/here", variables, "/foo/bar,1024/here");
  });
  test("Level 3 - Fragment expansion with multiple variables", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      x: "1024",
      y: "768"
    };
    testResolution("{#x,hello,y}", variables, "#1024,Hello%20World!,768");
    testResolution("{#path,x}/here", variables, "#/foo/bar,1024/here");
  });
  test("Level 3 - Label expansion with dot-prefix", () => {
    const variables = {
      var: "value",
      x: "1024",
      y: "768"
    };
    testResolution("X{.var}", variables, "X.value");
    testResolution("X{.x,y}", variables, "X.1024.768");
  });
  test("Level 3 - Path segments expansion", () => {
    const variables = {
      var: "value",
      x: "1024"
    };
    testResolution("{/var}", variables, "/value");
    testResolution("{/var,x}/here", variables, "/value/1024/here");
  });
  test("Level 3 - Path-style parameter expansion", () => {
    const variables = {
      x: "1024",
      y: "768",
      empty: ""
    };
    testResolution("{;x,y}", variables, ";x=1024;y=768");
    testResolution("{;x,y,empty}", variables, ";x=1024;y=768;empty");
  });
  test("Level 3 - Form-style query expansion", () => {
    const variables = {
      x: "1024",
      y: "768",
      empty: ""
    };
    testResolution("{?x,y}", variables, "?x=1024&y=768");
    testResolution("{?x,y,empty}", variables, "?x=1024&y=768&empty=");
  });
  test("Level 3 - Form-style query continuation", () => {
    const variables = {
      x: "1024",
      y: "768",
      empty: ""
    };
    testResolution("?fixed=yes{&x}", variables, "?fixed=yes&x=1024");
    testResolution("{&x,y,empty}", variables, "&x=1024&y=768&empty=");
  });
  test("Level 4 - String expansion with value modifiers", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{var:3}", variables, "val");
    testResolution("{var:30}", variables, "value");
    testResolution("{list}", variables, "red,green,blue");
    testResolution("{list*}", variables, "red,green,blue");
  });
  test("Level 4 - Reserved expansion with value modifiers", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{+path:6}/here", variables, "/foo/b/here");
    testResolution("{+list}", variables, "red,green,blue");
    testResolution("{+list*}", variables, "red,green,blue");
    testResolution("{+keys}", variables, "semi,;,dot,.,comma,,");
    testResolution("{+keys*}", variables, "semi=;,dot=.,comma=,");
  });
  test("Level 4 - Fragment expansion with value modifiers", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{#path:6}/here", variables, "#/foo/b/here");
    testResolution("{#list}", variables, "#red,green,blue");
    testResolution("{#list*}", variables, "#red,green,blue");
    testResolution("{#keys}", variables, "#semi,;,dot,.,comma,,");
    testResolution("{#keys*}", variables, "#semi=;,dot=.,comma=,");
  });
  test("Level 4 - Label expansion with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("X{.var:3}", variables, "X.val");
    testResolution("X{.list}", variables, "X.red,green,blue");
    testResolution("X{.list*}", variables, "X.red.green.blue");
    testResolution("X{.keys}", variables, "X.semi,;,dot,.,comma,,");
    testResolution("X{.keys*}", variables, "X.semi=;.dot=..comma=,");
  });
  test("Level 4 - Path expansion with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      path: "/foo/bar",
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{/var:1,var}", variables, "/v/value");
    testResolution("{/list}", variables, "/red,green,blue");
    testResolution("{/list*}", variables, "/red/green/blue");
    testResolution("{/list*,path:4}", variables, "/red/green/blue/%2Ffoo");
    testResolution("{/keys}", variables, "/semi,;,dot,.,comma,,");
    testResolution("{/keys*}", variables, "/semi=%3B/dot=./comma=%2C");
  });
  test("Level 4 - Path-style parameters with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{;hello:5}", { hello: "Hello World!" }, ";hello=Hello");
    testResolution("{;list}", variables, ";list=red,green,blue");
    testResolution("{;list*}", variables, ";list=red;list=green;list=blue");
    testResolution("{;keys}", variables, ";keys=semi,;,dot,.,comma,,");
    testResolution("{;keys*}", variables, ";semi=;;dot=.;comma=,");
  });
  test("Level 4 - Form-style query with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{?var:3}", variables, "?var=val");
    testResolution("{?list}", variables, "?list=red,green,blue");
    testResolution("{?list*}", variables, "?list=red&list=green&list=blue");
    testResolution("{?keys}", variables, "?keys=semi,;,dot,.,comma,,");
    testResolution("{?keys*}", variables, "?semi=;&dot=.&comma=,");
  });
  test("Level 4 - Form-style query continuation with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("?fixed=yes{&var:3}", variables, "?fixed=yes&var=val");
    testResolution("?fixed=yes{&list}", variables, "?fixed=yes&list=red,green,blue");
    testResolution("?fixed=yes{&list*}", variables, "?fixed=yes&list=red&list=green&list=blue");
    testResolution("?fixed=yes{&keys}", variables, "?fixed=yes&keys=semi,;,dot,.,comma,,");
    testResolution("?fixed=yes{&keys*}", variables, "?fixed=yes&semi=;&dot=.&comma=,");
  });
  test("handling undefined or null values", () => {
    const variables = {
      defined: "value",
      undef: void 0,
      null: null,
      empty: ""
    };
    testResolution("{defined,undef,null,empty}", variables, "value,");
    testResolution("{+defined,undef,null,empty}", variables, "value,");
    testResolution("{#defined,undef,null,empty}", variables, "#value,");
    testResolution("X{.defined,undef,null,empty}", variables, "X.value");
    testResolution("{/defined,undef,null}", variables, "/value");
    testResolution("{;defined,empty}", variables, ";defined=value;empty");
    testResolution("{?defined,undef,null,empty}", variables, "?defined=value&undef=&null=&empty=");
    testResolution("{&defined,undef,null,empty}", variables, "&defined=value&undef=&null=&empty=");
  });
  test("complex templates", () => {
    const variables = {
      domain: "example.com",
      user: "fred",
      path: ["path", "to", "resource"],
      query: "search",
      page: 5,
      lang: "en",
      sessionId: "123abc",
      filters: ["color:blue", "shape:square"],
      coordinates: { lat: "37.7", lon: "-122.4" }
    };
    testResolution(
      "https://{domain}/api/v1/users/{user}{/path*}{?query,page,lang}",
      variables,
      "https://example.com/api/v1/users/fred/path/to/resource?query=search&page=5&lang=en"
    );
    testResolution(
      "https://{domain}/search{?query,filters,coordinates*}",
      variables,
      "https://example.com/search?query=search&filters=color:blue,shape:square&lat=37.7&lon=-122.4"
    );
    testResolution(
      "https://{domain}/users/{user}/profile{.lang}{?sessionId}{#path}",
      variables,
      "https://example.com/users/fred/profile.en?sessionId=123abc#path,to,resource"
    );
  });
  test("literals and escaping", () => {
    testParsing("http://example.com/literal", []);
    testParsing("http://example.com/{var}literal{var2}", [
      {
        expression: "{var}",
        operator: "",
        variables: [{ explodable: false, name: "var", optional: false, prefixLength: void 0, repeatable: false }]
      },
      {
        expression: "{var2}",
        operator: "",
        variables: [{ explodable: false, name: "var2", optional: false, prefixLength: void 0, repeatable: false }]
      }
    ]);
    testResolution("http://example.com/{{var}}", { var: "value" }, "http://example.com/{var}");
  });
  test("edge cases", () => {
    testResolution("", {}, "");
    testResolution("http://example.com/path", {}, "http://example.com/path");
    testResolution("{var}", {}, "");
    testResolution("{a}{b}{c}", { a: "1", b: "2", c: "3" }, "123");
    testResolution("{_hidden.var-name$}", { "_hidden.var-name$": "value" }, "value");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9jb21tb24vdXJpVGVtcGxhdGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgVXJpVGVtcGxhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vdXJpVGVtcGxhdGUuanMnO1xuaW1wb3J0ICogYXMgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5cbnN1aXRlKCdVcmlUZW1wbGF0ZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0LyoqXG5cdCAqIEhlbHBlciBmdW5jdGlvbiB0byB0ZXN0IHRlbXBsYXRlIHBhcnNpbmcgYW5kIGNvbXBvbmVudCBleHRyYWN0aW9uXG5cdCAqL1xuXHRmdW5jdGlvbiB0ZXN0UGFyc2luZyh0ZW1wbGF0ZTogc3RyaW5nLCBleHBlY3RlZENvbXBvbmVudHM6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IHRlbXBsID0gVXJpVGVtcGxhdGUucGFyc2UodGVtcGxhdGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVtcGwuY29tcG9uZW50cy5maWx0ZXIoYyA9PiB0eXBlb2YgYyA9PT0gJ29iamVjdCcpLCBleHBlY3RlZENvbXBvbmVudHMpO1xuXHRcdHJldHVybiB0ZW1wbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBIZWxwZXIgZnVuY3Rpb24gdG8gdGVzdCB0ZW1wbGF0ZSByZXNvbHV0aW9uXG5cdCAqL1xuXHRmdW5jdGlvbiB0ZXN0UmVzb2x1dGlvbih0ZW1wbGF0ZTogc3RyaW5nLCB2YXJpYWJsZXM6IFJlY29yZDxzdHJpbmcsIGFueT4sIGV4cGVjdGVkOiBzdHJpbmcpIHtcblx0XHRjb25zdCB0ZW1wbCA9IFVyaVRlbXBsYXRlLnBhcnNlKHRlbXBsYXRlKTtcblx0XHRjb25zdCByZXN1bHQgPSB0ZW1wbC5yZXNvbHZlKHZhcmlhYmxlcyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWQpO1xuXHR9XG5cblx0dGVzdCgnc2ltcGxlIHJlcGxhY2VtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlbXBsID0gVXJpVGVtcGxhdGUucGFyc2UoJ2h0dHA6Ly9leGFtcGxlLmNvbS97dmFyfScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVtcGwuY29tcG9uZW50cywgWydodHRwOi8vZXhhbXBsZS5jb20vJywge1xuXHRcdFx0ZXhwcmVzc2lvbjogJ3t2YXJ9Jyxcblx0XHRcdG9wZXJhdG9yOiAnJyxcblx0XHRcdHZhcmlhYmxlczogW3sgZXhwbG9kYWJsZTogZmFsc2UsIG5hbWU6ICd2YXInLCBvcHRpb25hbDogZmFsc2UsIHByZWZpeExlbmd0aDogdW5kZWZpbmVkLCByZXBlYXRhYmxlOiBmYWxzZSB9XVxuXHRcdH0sICcnXSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGVtcGwucmVzb2x2ZSh7IHZhcjogJ3ZhbHVlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAnaHR0cDovL2V4YW1wbGUuY29tL3ZhbHVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNpbmcgY29tcG9uZW50cyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0Ly8gU2ltcGxlIGNvbXBvbmVudFxuXHRcdHRlc3RQYXJzaW5nKCdodHRwOi8vZXhhbXBsZS5jb20ve3Zhcn0nLCBbe1xuXHRcdFx0ZXhwcmVzc2lvbjogJ3t2YXJ9Jyxcblx0XHRcdG9wZXJhdG9yOiAnJyxcblx0XHRcdHZhcmlhYmxlczogW3sgZXhwbG9kYWJsZTogZmFsc2UsIG5hbWU6ICd2YXInLCBvcHRpb25hbDogZmFsc2UsIHByZWZpeExlbmd0aDogdW5kZWZpbmVkLCByZXBlYXRhYmxlOiBmYWxzZSB9XVxuXHRcdH1dKTtcblxuXHRcdC8vIENvbXBvbmVudCB3aXRoIG9wZXJhdG9yXG5cdFx0dGVzdFBhcnNpbmcoJ2h0dHA6Ly9leGFtcGxlLmNvbS97K3BhdGh9JywgW3tcblx0XHRcdGV4cHJlc3Npb246ICd7K3BhdGh9Jyxcblx0XHRcdG9wZXJhdG9yOiAnKycsXG5cdFx0XHR2YXJpYWJsZXM6IFt7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAncGF0aCcsIG9wdGlvbmFsOiBmYWxzZSwgcHJlZml4TGVuZ3RoOiB1bmRlZmluZWQsIHJlcGVhdGFibGU6IGZhbHNlIH1dXG5cdFx0fV0pO1xuXG5cdFx0Ly8gQ29tcG9uZW50IHdpdGggbXVsdGlwbGUgdmFyaWFibGVzXG5cdFx0dGVzdFBhcnNpbmcoJ2h0dHA6Ly9leGFtcGxlLmNvbS97eCx5fScsIFt7XG5cdFx0XHRleHByZXNzaW9uOiAne3gseX0nLFxuXHRcdFx0b3BlcmF0b3I6ICcnLFxuXHRcdFx0dmFyaWFibGVzOiBbXG5cdFx0XHRcdHsgZXhwbG9kYWJsZTogZmFsc2UsIG5hbWU6ICd4Jywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IHVuZGVmaW5lZCwgcmVwZWF0YWJsZTogZmFsc2UgfSxcblx0XHRcdFx0eyBleHBsb2RhYmxlOiBmYWxzZSwgbmFtZTogJ3knLCBvcHRpb25hbDogZmFsc2UsIHByZWZpeExlbmd0aDogdW5kZWZpbmVkLCByZXBlYXRhYmxlOiBmYWxzZSB9XG5cdFx0XHRdXG5cdFx0fV0pO1xuXG5cdFx0Ly8gQ29tcG9uZW50IHdpdGggdmFsdWUgbW9kaWZpZXJzXG5cdFx0dGVzdFBhcnNpbmcoJ2h0dHA6Ly9leGFtcGxlLmNvbS97dmFyOjN9JywgW3tcblx0XHRcdGV4cHJlc3Npb246ICd7dmFyOjN9Jyxcblx0XHRcdG9wZXJhdG9yOiAnJyxcblx0XHRcdHZhcmlhYmxlczogW3sgZXhwbG9kYWJsZTogZmFsc2UsIG5hbWU6ICd2YXInLCBvcHRpb25hbDogZmFsc2UsIHByZWZpeExlbmd0aDogMywgcmVwZWF0YWJsZTogZmFsc2UgfV1cblx0XHR9XSk7XG5cblx0XHR0ZXN0UGFyc2luZygnaHR0cDovL2V4YW1wbGUuY29tL3tsaXN0Kn0nLCBbe1xuXHRcdFx0ZXhwcmVzc2lvbjogJ3tsaXN0Kn0nLFxuXHRcdFx0b3BlcmF0b3I6ICcnLFxuXHRcdFx0dmFyaWFibGVzOiBbeyBleHBsb2RhYmxlOiB0cnVlLCBuYW1lOiAnbGlzdCcsIG9wdGlvbmFsOiBmYWxzZSwgcHJlZml4TGVuZ3RoOiB1bmRlZmluZWQsIHJlcGVhdGFibGU6IHRydWUgfV1cblx0XHR9XSk7XG5cblx0XHQvLyBNdWx0aXBsZSBjb21wb25lbnRzXG5cdFx0dGVzdFBhcnNpbmcoJ2h0dHA6Ly9leGFtcGxlLmNvbS97eH0vcGF0aC97eX0nLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGV4cHJlc3Npb246ICd7eH0nLFxuXHRcdFx0XHRvcGVyYXRvcjogJycsXG5cdFx0XHRcdHZhcmlhYmxlczogW3sgZXhwbG9kYWJsZTogZmFsc2UsIG5hbWU6ICd4Jywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IHVuZGVmaW5lZCwgcmVwZWF0YWJsZTogZmFsc2UgfV1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGV4cHJlc3Npb246ICd7eX0nLFxuXHRcdFx0XHRvcGVyYXRvcjogJycsXG5cdFx0XHRcdHZhcmlhYmxlczogW3sgZXhwbG9kYWJsZTogZmFsc2UsIG5hbWU6ICd5Jywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IHVuZGVmaW5lZCwgcmVwZWF0YWJsZTogZmFsc2UgfV1cblx0XHRcdH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgMSAtIFNpbXBsZSBzdHJpbmcgZXhwYW5zaW9uJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgZnJvbSBSRkMgNjU3MCBTZWN0aW9uIDEuMlxuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHZhcjogJ3ZhbHVlJyxcblx0XHRcdGhlbGxvOiAnSGVsbG8gV29ybGQhJ1xuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbigne3Zhcn0nLCB2YXJpYWJsZXMsICd2YWx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7aGVsbG99JywgdmFyaWFibGVzLCAnSGVsbG8lMjBXb3JsZCUyMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250cm9sIGNoYXJhY3RlcnMgYXJlIHBlcmNlbnQtZW5jb2RlZCB3aXRoIHR3byBoZXggZGlnaXRzJywgKCkgPT4ge1xuXHRcdC8vIENvZGUgcG9pbnRzIGJlbG93IDB4MTAgbXVzdCBiZSB6ZXJvLXBhZGRlZCAoZS5nLiAlMDksIG5vdCAlOSkgc28gdGhlXG5cdFx0Ly8gb3V0cHV0IGlzIGEgdmFsaWQgcGVyY2VudC1lbmNvZGluZyB0aGF0IGRlY29kZVVSSUNvbXBvbmVudCBhY2NlcHRzLlxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7eH0nLCB7IHg6ICdhXFx0YicgfSwgJ2ElMDliJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3t4fScsIHsgeDogJ1xcbicgfSwgJyUwQScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7eH0nLCB7IHg6ICdcXHInIH0sICclMEQnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgMiAtIFJlc2VydmVkIGV4cGFuc2lvbicsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRoZWxsbzogJ0hlbGxvIFdvcmxkIScsXG5cdFx0XHRwYXRoOiAnL2Zvby9iYXInXG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7K3Zhcn0nLCB2YXJpYWJsZXMsICd2YWx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7K2hlbGxvfScsIHZhcmlhYmxlcywgJ0hlbGxvJTIwV29ybGQhJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3srcGF0aH0vaGVyZScsIHZhcmlhYmxlcywgJy9mb28vYmFyL2hlcmUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbignaGVyZT9yZWY9eytwYXRofScsIHZhcmlhYmxlcywgJ2hlcmU/cmVmPS9mb28vYmFyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDIgLSBGcmFnbWVudCBleHBhbnNpb24nLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyBmcm9tIFJGQyA2NTcwIFNlY3Rpb24gMS4yXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0aGVsbG86ICdIZWxsbyBXb3JsZCEnXG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCdYeyN2YXJ9JywgdmFyaWFibGVzLCAnWCN2YWx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCdYeyNoZWxsb30nLCB2YXJpYWJsZXMsICdYI0hlbGxvJTIwV29ybGQhJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDMgLSBTdHJpbmcgZXhwYW5zaW9uIHdpdGggbXVsdGlwbGUgdmFyaWFibGVzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgZnJvbSBSRkMgNjU3MCBTZWN0aW9uIDEuMlxuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHZhcjogJ3ZhbHVlJyxcblx0XHRcdGhlbGxvOiAnSGVsbG8gV29ybGQhJyxcblx0XHRcdGVtcHR5OiAnJyxcblx0XHRcdHBhdGg6ICcvZm9vL2JhcicsXG5cdFx0XHR4OiAnMTAyNCcsXG5cdFx0XHR5OiAnNzY4J1xuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbignbWFwP3t4LHl9JywgdmFyaWFibGVzLCAnbWFwPzEwMjQsNzY4Jyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3t4LGhlbGxvLHl9JywgdmFyaWFibGVzLCAnMTAyNCxIZWxsbyUyMFdvcmxkJTIxLDc2OCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCAzIC0gUmVzZXJ2ZWQgZXhwYW5zaW9uIHdpdGggbXVsdGlwbGUgdmFyaWFibGVzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgZnJvbSBSRkMgNjU3MCBTZWN0aW9uIDEuMlxuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHZhcjogJ3ZhbHVlJyxcblx0XHRcdGhlbGxvOiAnSGVsbG8gV29ybGQhJyxcblx0XHRcdHBhdGg6ICcvZm9vL2JhcicsXG5cdFx0XHR4OiAnMTAyNCcsXG5cdFx0XHR5OiAnNzY4J1xuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbigneyt4LGhlbGxvLHl9JywgdmFyaWFibGVzLCAnMTAyNCxIZWxsbyUyMFdvcmxkISw3NjgnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneytwYXRoLHh9L2hlcmUnLCB2YXJpYWJsZXMsICcvZm9vL2JhciwxMDI0L2hlcmUnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgMyAtIEZyYWdtZW50IGV4cGFuc2lvbiB3aXRoIG11bHRpcGxlIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRoZWxsbzogJ0hlbGxvIFdvcmxkIScsXG5cdFx0XHRwYXRoOiAnL2Zvby9iYXInLFxuXHRcdFx0eDogJzEwMjQnLFxuXHRcdFx0eTogJzc2OCdcblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ3sjeCxoZWxsbyx5fScsIHZhcmlhYmxlcywgJyMxMDI0LEhlbGxvJTIwV29ybGQhLDc2OCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7I3BhdGgseH0vaGVyZScsIHZhcmlhYmxlcywgJyMvZm9vL2JhciwxMDI0L2hlcmUnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgMyAtIExhYmVsIGV4cGFuc2lvbiB3aXRoIGRvdC1wcmVmaXgnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyBmcm9tIFJGQyA2NTcwIFNlY3Rpb24gMS4yXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0eDogJzEwMjQnLFxuXHRcdFx0eTogJzc2OCdcblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ1h7LnZhcn0nLCB2YXJpYWJsZXMsICdYLnZhbHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ1h7LngseX0nLCB2YXJpYWJsZXMsICdYLjEwMjQuNzY4Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDMgLSBQYXRoIHNlZ21lbnRzIGV4cGFuc2lvbicsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHR4OiAnMTAyNCdcblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ3svdmFyfScsIHZhcmlhYmxlcywgJy92YWx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7L3Zhcix4fS9oZXJlJywgdmFyaWFibGVzLCAnL3ZhbHVlLzEwMjQvaGVyZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCAzIC0gUGF0aC1zdHlsZSBwYXJhbWV0ZXIgZXhwYW5zaW9uJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgZnJvbSBSRkMgNjU3MCBTZWN0aW9uIDEuMlxuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHg6ICcxMDI0Jyxcblx0XHRcdHk6ICc3NjgnLFxuXHRcdFx0ZW1wdHk6ICcnXG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7O3gseX0nLCB2YXJpYWJsZXMsICc7eD0xMDI0O3k9NzY4Jyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3s7eCx5LGVtcHR5fScsIHZhcmlhYmxlcywgJzt4PTEwMjQ7eT03Njg7ZW1wdHknKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgMyAtIEZvcm0tc3R5bGUgcXVlcnkgZXhwYW5zaW9uJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgZnJvbSBSRkMgNjU3MCBTZWN0aW9uIDEuMlxuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHg6ICcxMDI0Jyxcblx0XHRcdHk6ICc3NjgnLFxuXHRcdFx0ZW1wdHk6ICcnXG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7P3gseX0nLCB2YXJpYWJsZXMsICc/eD0xMDI0Jnk9NzY4Jyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3s/eCx5LGVtcHR5fScsIHZhcmlhYmxlcywgJz94PTEwMjQmeT03NjgmZW1wdHk9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDMgLSBGb3JtLXN0eWxlIHF1ZXJ5IGNvbnRpbnVhdGlvbicsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR4OiAnMTAyNCcsXG5cdFx0XHR5OiAnNzY4Jyxcblx0XHRcdGVtcHR5OiAnJ1xuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbignP2ZpeGVkPXllc3smeH0nLCB2YXJpYWJsZXMsICc/Zml4ZWQ9eWVzJng9MTAyNCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7JngseSxlbXB0eX0nLCB2YXJpYWJsZXMsICcmeD0xMDI0Jnk9NzY4JmVtcHR5PScpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCA0IC0gU3RyaW5nIGV4cGFuc2lvbiB3aXRoIHZhbHVlIG1vZGlmaWVycycsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRoZWxsbzogJ0hlbGxvIFdvcmxkIScsXG5cdFx0XHRwYXRoOiAnL2Zvby9iYXInLFxuXHRcdFx0bGlzdDogWydyZWQnLCAnZ3JlZW4nLCAnYmx1ZSddLFxuXHRcdFx0a2V5czoge1xuXHRcdFx0XHRzZW1pOiAnOycsXG5cdFx0XHRcdGRvdDogJy4nLFxuXHRcdFx0XHRjb21tYTogJywnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7dmFyOjN9JywgdmFyaWFibGVzLCAndmFsJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3t2YXI6MzB9JywgdmFyaWFibGVzLCAndmFsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigne2xpc3R9JywgdmFyaWFibGVzLCAncmVkLGdyZWVuLGJsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigne2xpc3QqfScsIHZhcmlhYmxlcywgJ3JlZCxncmVlbixibHVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDQgLSBSZXNlcnZlZCBleHBhbnNpb24gd2l0aCB2YWx1ZSBtb2RpZmllcnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyByZWxhdGVkIHRvIExldmVsIDQgZmVhdHVyZXNcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRoZWxsbzogJ0hlbGxvIFdvcmxkIScsXG5cdFx0XHRwYXRoOiAnL2Zvby9iYXInLFxuXHRcdFx0bGlzdDogWydyZWQnLCAnZ3JlZW4nLCAnYmx1ZSddLFxuXHRcdFx0a2V5czoge1xuXHRcdFx0XHRzZW1pOiAnOycsXG5cdFx0XHRcdGRvdDogJy4nLFxuXHRcdFx0XHRjb21tYTogJywnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7K3BhdGg6Nn0vaGVyZScsIHZhcmlhYmxlcywgJy9mb28vYi9oZXJlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3srbGlzdH0nLCB2YXJpYWJsZXMsICdyZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7K2xpc3QqfScsIHZhcmlhYmxlcywgJ3JlZCxncmVlbixibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3sra2V5c30nLCB2YXJpYWJsZXMsICdzZW1pLDssZG90LC4sY29tbWEsLCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7K2tleXMqfScsIHZhcmlhYmxlcywgJ3NlbWk9Oyxkb3Q9Lixjb21tYT0sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDQgLSBGcmFnbWVudCBleHBhbnNpb24gd2l0aCB2YWx1ZSBtb2RpZmllcnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyByZWxhdGVkIHRvIExldmVsIDQgZmVhdHVyZXNcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRoZWxsbzogJ0hlbGxvIFdvcmxkIScsXG5cdFx0XHRwYXRoOiAnL2Zvby9iYXInLFxuXHRcdFx0bGlzdDogWydyZWQnLCAnZ3JlZW4nLCAnYmx1ZSddLFxuXHRcdFx0a2V5czoge1xuXHRcdFx0XHRzZW1pOiAnOycsXG5cdFx0XHRcdGRvdDogJy4nLFxuXHRcdFx0XHRjb21tYTogJywnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7I3BhdGg6Nn0vaGVyZScsIHZhcmlhYmxlcywgJyMvZm9vL2IvaGVyZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7I2xpc3R9JywgdmFyaWFibGVzLCAnI3JlZCxncmVlbixibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3sjbGlzdCp9JywgdmFyaWFibGVzLCAnI3JlZCxncmVlbixibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3sja2V5c30nLCB2YXJpYWJsZXMsICcjc2VtaSw7LGRvdCwuLGNvbW1hLCwnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneyNrZXlzKn0nLCB2YXJpYWJsZXMsICcjc2VtaT07LGRvdD0uLGNvbW1hPSwnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgNCAtIExhYmVsIGV4cGFuc2lvbiB3aXRoIHZhbHVlIG1vZGlmaWVycycsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIHJlbGF0ZWQgdG8gTGV2ZWwgNCBmZWF0dXJlc1xuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHZhcjogJ3ZhbHVlJyxcblx0XHRcdGxpc3Q6IFsncmVkJywgJ2dyZWVuJywgJ2JsdWUnXSxcblx0XHRcdGtleXM6IHtcblx0XHRcdFx0c2VtaTogJzsnLFxuXHRcdFx0XHRkb3Q6ICcuJyxcblx0XHRcdFx0Y29tbWE6ICcsJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbignWHsudmFyOjN9JywgdmFyaWFibGVzLCAnWC52YWwnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbignWHsubGlzdH0nLCB2YXJpYWJsZXMsICdYLnJlZCxncmVlbixibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ1h7Lmxpc3QqfScsIHZhcmlhYmxlcywgJ1gucmVkLmdyZWVuLmJsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbignWHsua2V5c30nLCB2YXJpYWJsZXMsICdYLnNlbWksOyxkb3QsLixjb21tYSwsJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ1h7LmtleXMqfScsIHZhcmlhYmxlcywgJ1guc2VtaT07LmRvdD0uLmNvbW1hPSwnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgNCAtIFBhdGggZXhwYW5zaW9uIHdpdGggdmFsdWUgbW9kaWZpZXJzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgcmVsYXRlZCB0byBMZXZlbCA0IGZlYXR1cmVzXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0bGlzdDogWydyZWQnLCAnZ3JlZW4nLCAnYmx1ZSddLFxuXHRcdFx0cGF0aDogJy9mb28vYmFyJyxcblx0XHRcdGtleXM6IHtcblx0XHRcdFx0c2VtaTogJzsnLFxuXHRcdFx0XHRkb3Q6ICcuJyxcblx0XHRcdFx0Y29tbWE6ICcsJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbigney92YXI6MSx2YXJ9JywgdmFyaWFibGVzLCAnL3YvdmFsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigney9saXN0fScsIHZhcmlhYmxlcywgJy9yZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7L2xpc3QqfScsIHZhcmlhYmxlcywgJy9yZWQvZ3JlZW4vYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7L2xpc3QqLHBhdGg6NH0nLCB2YXJpYWJsZXMsICcvcmVkL2dyZWVuL2JsdWUvJTJGZm9vJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3sva2V5c30nLCB2YXJpYWJsZXMsICcvc2VtaSw7LGRvdCwuLGNvbW1hLCwnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigney9rZXlzKn0nLCB2YXJpYWJsZXMsICcvc2VtaT0lM0IvZG90PS4vY29tbWE9JTJDJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDQgLSBQYXRoLXN0eWxlIHBhcmFtZXRlcnMgd2l0aCB2YWx1ZSBtb2RpZmllcnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyByZWxhdGVkIHRvIExldmVsIDQgZmVhdHVyZXNcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRsaXN0OiBbJ3JlZCcsICdncmVlbicsICdibHVlJ10sXG5cdFx0XHRrZXlzOiB7XG5cdFx0XHRcdHNlbWk6ICc7Jyxcblx0XHRcdFx0ZG90OiAnLicsXG5cdFx0XHRcdGNvbW1hOiAnLCdcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ3s7aGVsbG86NX0nLCB7IGhlbGxvOiAnSGVsbG8gV29ybGQhJyB9LCAnO2hlbGxvPUhlbGxvJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3s7bGlzdH0nLCB2YXJpYWJsZXMsICc7bGlzdD1yZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7O2xpc3QqfScsIHZhcmlhYmxlcywgJztsaXN0PXJlZDtsaXN0PWdyZWVuO2xpc3Q9Ymx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7O2tleXN9JywgdmFyaWFibGVzLCAnO2tleXM9c2VtaSw7LGRvdCwuLGNvbW1hLCwnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneztrZXlzKn0nLCB2YXJpYWJsZXMsICc7c2VtaT07O2RvdD0uO2NvbW1hPSwnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgNCAtIEZvcm0tc3R5bGUgcXVlcnkgd2l0aCB2YWx1ZSBtb2RpZmllcnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyByZWxhdGVkIHRvIExldmVsIDQgZmVhdHVyZXNcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRsaXN0OiBbJ3JlZCcsICdncmVlbicsICdibHVlJ10sXG5cdFx0XHRrZXlzOiB7XG5cdFx0XHRcdHNlbWk6ICc7Jyxcblx0XHRcdFx0ZG90OiAnLicsXG5cdFx0XHRcdGNvbW1hOiAnLCdcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ3s/dmFyOjN9JywgdmFyaWFibGVzLCAnP3Zhcj12YWwnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbignez9saXN0fScsIHZhcmlhYmxlcywgJz9saXN0PXJlZCxncmVlbixibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3s/bGlzdCp9JywgdmFyaWFibGVzLCAnP2xpc3Q9cmVkJmxpc3Q9Z3JlZW4mbGlzdD1ibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3s/a2V5c30nLCB2YXJpYWJsZXMsICc/a2V5cz1zZW1pLDssZG90LC4sY29tbWEsLCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7P2tleXMqfScsIHZhcmlhYmxlcywgJz9zZW1pPTsmZG90PS4mY29tbWE9LCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCA0IC0gRm9ybS1zdHlsZSBxdWVyeSBjb250aW51YXRpb24gd2l0aCB2YWx1ZSBtb2RpZmllcnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyByZWxhdGVkIHRvIExldmVsIDQgZmVhdHVyZXNcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRsaXN0OiBbJ3JlZCcsICdncmVlbicsICdibHVlJ10sXG5cdFx0XHRrZXlzOiB7XG5cdFx0XHRcdHNlbWk6ICc7Jyxcblx0XHRcdFx0ZG90OiAnLicsXG5cdFx0XHRcdGNvbW1hOiAnLCdcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJz9maXhlZD15ZXN7JnZhcjozfScsIHZhcmlhYmxlcywgJz9maXhlZD15ZXMmdmFyPXZhbCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCc/Zml4ZWQ9eWVzeyZsaXN0fScsIHZhcmlhYmxlcywgJz9maXhlZD15ZXMmbGlzdD1yZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCc/Zml4ZWQ9eWVzeyZsaXN0Kn0nLCB2YXJpYWJsZXMsICc/Zml4ZWQ9eWVzJmxpc3Q9cmVkJmxpc3Q9Z3JlZW4mbGlzdD1ibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJz9maXhlZD15ZXN7JmtleXN9JywgdmFyaWFibGVzLCAnP2ZpeGVkPXllcyZrZXlzPXNlbWksOyxkb3QsLixjb21tYSwsJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJz9maXhlZD15ZXN7JmtleXMqfScsIHZhcmlhYmxlcywgJz9maXhlZD15ZXMmc2VtaT07JmRvdD0uJmNvbW1hPSwnKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxpbmcgdW5kZWZpbmVkIG9yIG51bGwgdmFsdWVzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgaGFuZGxpbmcgb2YgdW5kZWZpbmVkL251bGwgdmFsdWVzIGZvciBkaWZmZXJlbnQgb3BlcmF0b3JzXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0ZGVmaW5lZDogJ3ZhbHVlJyxcblx0XHRcdHVuZGVmOiB1bmRlZmluZWQsXG5cdFx0XHRudWxsOiBudWxsLFxuXHRcdFx0ZW1wdHk6ICcnXG5cdFx0fTtcblxuXHRcdC8vIFNpbXBsZSBzdHJpbmcgZXhwYW5zaW9uXG5cdFx0dGVzdFJlc29sdXRpb24oJ3tkZWZpbmVkLHVuZGVmLG51bGwsZW1wdHl9JywgdmFyaWFibGVzLCAndmFsdWUsJyk7XG5cblx0XHQvLyBSZXNlcnZlZCBleHBhbnNpb25cblx0XHR0ZXN0UmVzb2x1dGlvbigneytkZWZpbmVkLHVuZGVmLG51bGwsZW1wdHl9JywgdmFyaWFibGVzLCAndmFsdWUsJyk7XG5cblx0XHQvLyBGcmFnbWVudCBleHBhbnNpb25cblx0XHR0ZXN0UmVzb2x1dGlvbigneyNkZWZpbmVkLHVuZGVmLG51bGwsZW1wdHl9JywgdmFyaWFibGVzLCAnI3ZhbHVlLCcpO1xuXG5cdFx0Ly8gTGFiZWwgZXhwYW5zaW9uXG5cdFx0dGVzdFJlc29sdXRpb24oJ1h7LmRlZmluZWQsdW5kZWYsbnVsbCxlbXB0eX0nLCB2YXJpYWJsZXMsICdYLnZhbHVlJyk7XG5cblx0XHQvLyBQYXRoIHNlZ21lbnRzXG5cdFx0dGVzdFJlc29sdXRpb24oJ3svZGVmaW5lZCx1bmRlZixudWxsfScsIHZhcmlhYmxlcywgJy92YWx1ZScpO1xuXG5cdFx0Ly8gUGF0aC1zdHlsZSBwYXJhbWV0ZXJzXG5cdFx0dGVzdFJlc29sdXRpb24oJ3s7ZGVmaW5lZCxlbXB0eX0nLCB2YXJpYWJsZXMsICc7ZGVmaW5lZD12YWx1ZTtlbXB0eScpO1xuXG5cdFx0Ly8gRm9ybS1zdHlsZSBxdWVyeVxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7P2RlZmluZWQsdW5kZWYsbnVsbCxlbXB0eX0nLCB2YXJpYWJsZXMsICc/ZGVmaW5lZD12YWx1ZSZ1bmRlZj0mbnVsbD0mZW1wdHk9Jyk7XG5cblx0XHQvLyBGb3JtLXN0eWxlIHF1ZXJ5IGNvbnRpbnVhdGlvblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7JmRlZmluZWQsdW5kZWYsbnVsbCxlbXB0eX0nLCB2YXJpYWJsZXMsICcmZGVmaW5lZD12YWx1ZSZ1bmRlZj0mbnVsbD0mZW1wdHk9Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBsZXggdGVtcGxhdGVzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgbW9yZSBjb21wbGV4IHRlbXBsYXRlIGNvbWJpbmF0aW9uc1xuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdGRvbWFpbjogJ2V4YW1wbGUuY29tJyxcblx0XHRcdHVzZXI6ICdmcmVkJyxcblx0XHRcdHBhdGg6IFsncGF0aCcsICd0bycsICdyZXNvdXJjZSddLFxuXHRcdFx0cXVlcnk6ICdzZWFyY2gnLFxuXHRcdFx0cGFnZTogNSxcblx0XHRcdGxhbmc6ICdlbicsXG5cdFx0XHRzZXNzaW9uSWQ6ICcxMjNhYmMnLFxuXHRcdFx0ZmlsdGVyczogWydjb2xvcjpibHVlJywgJ3NoYXBlOnNxdWFyZSddLFxuXHRcdFx0Y29vcmRpbmF0ZXM6IHsgbGF0OiAnMzcuNycsIGxvbjogJy0xMjIuNCcgfVxuXHRcdH07XG5cblx0XHQvLyBSRVNUZnVsIFVSTCBwYXR0ZXJuXG5cdFx0dGVzdFJlc29sdXRpb24oJ2h0dHBzOi8ve2RvbWFpbn0vYXBpL3YxL3VzZXJzL3t1c2VyfXsvcGF0aCp9ez9xdWVyeSxwYWdlLGxhbmd9Jyxcblx0XHRcdHZhcmlhYmxlcyxcblx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MS91c2Vycy9mcmVkL3BhdGgvdG8vcmVzb3VyY2U/cXVlcnk9c2VhcmNoJnBhZ2U9NSZsYW5nPWVuJyk7XG5cblx0XHQvLyBDb21wbGV4IHF1ZXJ5IHBhcmFtZXRlcnNcblx0XHR0ZXN0UmVzb2x1dGlvbignaHR0cHM6Ly97ZG9tYWlufS9zZWFyY2h7P3F1ZXJ5LGZpbHRlcnMsY29vcmRpbmF0ZXMqfScsXG5cdFx0XHR2YXJpYWJsZXMsXG5cdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbS9zZWFyY2g/cXVlcnk9c2VhcmNoJmZpbHRlcnM9Y29sb3I6Ymx1ZSxzaGFwZTpzcXVhcmUmbGF0PTM3LjcmbG9uPS0xMjIuNCcpO1xuXG5cdFx0Ly8gTXVsdGlwbGUgZXhwcmVzc2lvbiB0eXBlc1xuXHRcdHRlc3RSZXNvbHV0aW9uKCdodHRwczovL3tkb21haW59L3VzZXJzL3t1c2VyfS9wcm9maWxley5sYW5nfXs/c2Vzc2lvbklkfXsjcGF0aH0nLFxuXHRcdFx0dmFyaWFibGVzLFxuXHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20vdXNlcnMvZnJlZC9wcm9maWxlLmVuP3Nlc3Npb25JZD0xMjNhYmMjcGF0aCx0byxyZXNvdXJjZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaXRlcmFscyBhbmQgZXNjYXBpbmcnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBsaXRlcmFsIHNlZ21lbnRzIGFuZCBlc2NhcGluZ1xuXHRcdHRlc3RQYXJzaW5nKCdodHRwOi8vZXhhbXBsZS5jb20vbGl0ZXJhbCcsIFtdKTtcblx0XHR0ZXN0UGFyc2luZygnaHR0cDovL2V4YW1wbGUuY29tL3t2YXJ9bGl0ZXJhbHt2YXIyfScsIFtcblx0XHRcdHtcblx0XHRcdFx0ZXhwcmVzc2lvbjogJ3t2YXJ9Jyxcblx0XHRcdFx0b3BlcmF0b3I6ICcnLFxuXHRcdFx0XHR2YXJpYWJsZXM6IFt7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAndmFyJywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IHVuZGVmaW5lZCwgcmVwZWF0YWJsZTogZmFsc2UgfV1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGV4cHJlc3Npb246ICd7dmFyMn0nLFxuXHRcdFx0XHRvcGVyYXRvcjogJycsXG5cdFx0XHRcdHZhcmlhYmxlczogW3sgZXhwbG9kYWJsZTogZmFsc2UsIG5hbWU6ICd2YXIyJywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IHVuZGVmaW5lZCwgcmVwZWF0YWJsZTogZmFsc2UgfV1cblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdC8vIFRlc3QgdGhhdCBlc2NhcGVkIGJyYWNlcyBhcmUgdHJlYXRlZCBhcyBsaXRlcmFsc1xuXHRcdC8vIE5vdGU6IFRoZSBjdXJyZW50IGltcGxlbWVudGF0aW9uIG1pZ2h0IG5vdCBoYW5kbGUgdGhpcyBjYXNlXG5cdFx0dGVzdFJlc29sdXRpb24oJ2h0dHA6Ly9leGFtcGxlLmNvbS97e3Zhcn19JywgeyB2YXI6ICd2YWx1ZScgfSwgJ2h0dHA6Ly9leGFtcGxlLmNvbS97dmFyfScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdC8vIEVtcHR5IHRlbXBsYXRlXG5cdFx0dGVzdFJlc29sdXRpb24oJycsIHt9LCAnJyk7XG5cblx0XHQvLyBUZW1wbGF0ZSB3aXRoIG9ubHkgbGl0ZXJhbHNcblx0XHR0ZXN0UmVzb2x1dGlvbignaHR0cDovL2V4YW1wbGUuY29tL3BhdGgnLCB7fSwgJ2h0dHA6Ly9leGFtcGxlLmNvbS9wYXRoJyk7XG5cblx0XHQvLyBObyB2YXJpYWJsZXMgcHJvdmlkZWQgZm9yIHJlc29sdXRpb25cblx0XHR0ZXN0UmVzb2x1dGlvbigne3Zhcn0nLCB7fSwgJycpO1xuXG5cdFx0Ly8gTXVsdGlwbGUgc2VxdWVudGlhbCBleHByZXNzaW9uc1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7YX17Yn17Y30nLCB7IGE6ICcxJywgYjogJzInLCBjOiAnMycgfSwgJzEyMycpO1xuXG5cdFx0Ly8gRXhwcmVzc2lvbnMgd2l0aCBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gdmFyaWFibGUgbmFtZXNcblx0XHR0ZXN0UmVzb2x1dGlvbigne19oaWRkZW4udmFyLW5hbWUkfScsIHsgJ19oaWRkZW4udmFyLW5hbWUk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
