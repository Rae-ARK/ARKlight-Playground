import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Token, TokenizationRegistry } from "../../../common/languages.js";
import { LanguageService } from "../../../common/services/languageService.js";
import { StandaloneConfigurationService } from "../../browser/standaloneServices.js";
import { compile } from "../../common/monarch/monarchCompile.js";
import { MonarchTokenizer } from "../../common/monarch/monarchLexer.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
suite("Monarch", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMonarchTokenizer(languageService, languageId, language, configurationService) {
    return new MonarchTokenizer(languageService, null, languageId, compile(languageId, language), configurationService);
  }
  function getTokens(tokenizer, lines) {
    const actualTokens = [];
    let state = tokenizer.getInitialState();
    for (const line of lines) {
      const result = tokenizer.tokenize(line, true, state);
      actualTokens.push(result.tokens);
      state = result.endState;
    }
    return actualTokens;
  }
  test("Ensure @rematch and nextEmbedded can be used together in Monarch grammar", () => {
    const disposables = new DisposableStore();
    const languageService = disposables.add(new LanguageService());
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    disposables.add(languageService.registerLanguage({ id: "sql" }));
    disposables.add(TokenizationRegistry.register("sql", disposables.add(createMonarchTokenizer(languageService, "sql", {
      tokenizer: {
        root: [
          [/./, "token"]
        ]
      }
    }, configurationService))));
    const SQL_QUERY_START = "(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|ALTER|WITH)";
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test1", {
      tokenizer: {
        root: [
          [`(""")${SQL_QUERY_START}`, [{ "token": "string.quote" }, { token: "@rematch", next: "@endStringWithSQL", nextEmbedded: "sql" }]],
          [/(""")$/, [{ token: "string.quote", next: "@maybeStringIsSQL" }]]
        ],
        maybeStringIsSQL: [
          [/(.*)/, {
            cases: {
              [`${SQL_QUERY_START}\\b.*`]: { token: "@rematch", next: "@endStringWithSQL", nextEmbedded: "sql" },
              "@default": { token: "@rematch", switchTo: "@endDblDocString" }
            }
          }]
        ],
        endDblDocString: [
          ["[^']+", "string"],
          ["\\\\'", "string"],
          ["'''", "string", "@popall"],
          ["'", "string"]
        ],
        endStringWithSQL: [[/"""/, { token: "string.quote", next: "@popall", nextEmbedded: "@pop" }]]
      }
    }, configurationService));
    const lines = [
      `mysql_query("""SELECT * FROM table_name WHERE ds = '<DATEID>'""")`,
      `mysql_query("""`,
      `SELECT *`,
      `FROM table_name`,
      `WHERE ds = '<DATEID>'`,
      `""")`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "source.test1", "test1"),
        new Token(12, "string.quote.test1", "test1"),
        new Token(15, "token.sql", "sql"),
        new Token(61, "string.quote.test1", "test1"),
        new Token(64, "source.test1", "test1")
      ],
      [
        new Token(0, "source.test1", "test1"),
        new Token(12, "string.quote.test1", "test1")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "string.quote.test1", "test1"),
        new Token(3, "source.test1", "test1")
      ]
    ]);
    disposables.dispose();
  });
  test('Test nextEmbedded: "@pop" in cases statement', () => {
    const disposables = new DisposableStore();
    const languageService = disposables.add(new LanguageService());
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    disposables.add(languageService.registerLanguage({ id: "sql" }));
    disposables.add(TokenizationRegistry.register("sql", disposables.add(createMonarchTokenizer(languageService, "sql", {
      tokenizer: {
        root: [
          [/./, "token"]
        ]
      }
    }, configurationService))));
    const SQL_QUERY_START = "(SELECT|INSERT|UPDATE|DELETE|CREATE|REPLACE|ALTER|WITH)";
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test1", {
      tokenizer: {
        root: [
          [`(""")${SQL_QUERY_START}`, [{ "token": "string.quote" }, { token: "@rematch", next: "@endStringWithSQL", nextEmbedded: "sql" }]],
          [/(""")$/, [{ token: "string.quote", next: "@maybeStringIsSQL" }]]
        ],
        maybeStringIsSQL: [
          [/(.*)/, {
            cases: {
              [`${SQL_QUERY_START}\\b.*`]: { token: "@rematch", next: "@endStringWithSQL", nextEmbedded: "sql" },
              "@default": { token: "@rematch", switchTo: "@endDblDocString" }
            }
          }]
        ],
        endDblDocString: [
          ["[^']+", "string"],
          ["\\\\'", "string"],
          ["'''", "string", "@popall"],
          ["'", "string"]
        ],
        endStringWithSQL: [[/"""/, {
          cases: {
            '"""': {
              cases: {
                "": { token: "string.quote", next: "@popall", nextEmbedded: "@pop" }
              }
            },
            "@default": ""
          }
        }]]
      }
    }, configurationService));
    const lines = [
      `mysql_query("""SELECT * FROM table_name WHERE ds = '<DATEID>'""")`,
      `mysql_query("""`,
      `SELECT *`,
      `FROM table_name`,
      `WHERE ds = '<DATEID>'`,
      `""")`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "source.test1", "test1"),
        new Token(12, "string.quote.test1", "test1"),
        new Token(15, "token.sql", "sql"),
        new Token(61, "string.quote.test1", "test1"),
        new Token(64, "source.test1", "test1")
      ],
      [
        new Token(0, "source.test1", "test1"),
        new Token(12, "string.quote.test1", "test1")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "token.sql", "sql")
      ],
      [
        new Token(0, "string.quote.test1", "test1"),
        new Token(3, "source.test1", "test1")
      ]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#1235: Empty Line Handling", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      tokenizer: {
        root: [
          { include: "@comments" }
        ],
        comments: [
          [/\/\/$/, "comment"],
          // empty single-line comment
          [/\/\//, "comment", "@comment_cpp"]
        ],
        comment_cpp: [
          [/(?:[^\\]|(?:\\.))+$/, "comment", "@pop"],
          [/.+$/, "comment"],
          [/$/, "comment", "@pop"]
          // No possible rule to detect an empty line and @pop?
        ]
      }
    }, configurationService));
    const lines = [
      `// This comment \\`,
      `   continues on the following line`,
      ``,
      `// This comment does NOT continue \\\\`,
      `   because the escape char was itself escaped`,
      ``,
      `// This comment DOES continue because \\\\\\`,
      `   the 1st '\\' escapes the 2nd; the 3rd escapes EOL`,
      ``,
      `// This comment continues to the following line \\`,
      ``,
      `But the line was empty. This line should not be commented.`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [new Token(0, "comment.test", "test")],
      [new Token(0, "comment.test", "test")],
      [],
      [new Token(0, "comment.test", "test")],
      [new Token(0, "source.test", "test")],
      [],
      [new Token(0, "comment.test", "test")],
      [new Token(0, "comment.test", "test")],
      [],
      [new Token(0, "comment.test", "test")],
      [],
      [new Token(0, "source.test", "test")]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#2265: Exit a state at end of line", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      includeLF: true,
      tokenizer: {
        root: [
          [/^\*/, "", "@inner"],
          [/\:\*/, "", "@inner"],
          [/[^*:]+/, "string"],
          [/[*:]/, "string"]
        ],
        inner: [
          [/\n/, "", "@pop"],
          [/\d+/, "number"],
          [/[^\d]+/, ""]
        ]
      }
    }, configurationService));
    const lines = [
      `PRINT 10 * 20`,
      `*FX200, 3`,
      `PRINT 2*3:*FX200, 3`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "string.test", "test")
      ],
      [
        new Token(0, "", "test"),
        new Token(3, "number.test", "test"),
        new Token(6, "", "test"),
        new Token(8, "number.test", "test")
      ],
      [
        new Token(0, "string.test", "test"),
        new Token(9, "", "test"),
        new Token(13, "number.test", "test"),
        new Token(16, "", "test"),
        new Token(18, "number.test", "test")
      ]
    ]);
    disposables.dispose();
  });
  test("issue #115662: monarchCompile function need an extra option which can control replacement", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer1 = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      uselessReplaceKey1: "@uselessReplaceKey2",
      uselessReplaceKey2: "@uselessReplaceKey3",
      uselessReplaceKey3: "@uselessReplaceKey4",
      uselessReplaceKey4: "@uselessReplaceKey5",
      uselessReplaceKey5: "@ham",
      tokenizer: {
        root: [
          {
            regex: /@\w+/.test("@ham") ? new RegExp(`^${"@uselessReplaceKey1"}$`) : new RegExp(`^${"@ham"}$`),
            action: { token: "ham" }
          }
        ]
      }
    }, configurationService));
    const tokenizer2 = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      tokenizer: {
        root: [
          {
            regex: /@@ham/,
            action: { token: "ham" }
          }
        ]
      }
    }, configurationService));
    const lines = [
      `@ham`
    ];
    const actualTokens1 = getTokens(tokenizer1, lines);
    assert.deepStrictEqual(actualTokens1, [
      [
        new Token(0, "ham.test", "test")
      ]
    ]);
    const actualTokens2 = getTokens(tokenizer2, lines);
    assert.deepStrictEqual(actualTokens2, [
      [
        new Token(0, "ham.test", "test")
      ]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#2424: Allow to target @@", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      tokenizer: {
        root: [
          {
            regex: /@@@@/,
            action: { token: "ham" }
          }
        ]
      }
    }, configurationService));
    const lines = [
      `@@`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "ham.test", "test")
      ]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#3025: Check maxTokenizationLineLength before tokenizing", async () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    await configurationService.updateValue("editor.maxTokenizationLineLength", 4);
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      tokenizer: {
        root: [
          {
            regex: /ham/,
            action: { token: "ham" }
          }
        ]
      }
    }, configurationService));
    const lines = [
      "ham",
      // length 3, should be tokenized
      "hamham"
      // length 6, should NOT be tokenized
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [
        new Token(0, "ham.test", "test")
      ],
      [
        new Token(0, "", "test")
      ]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#3128: allow state access within rules", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      encoding: /u|u8|U|L/,
      tokenizer: {
        root: [
          // C++ 11 Raw String
          [/@encoding?R\"(?:([^ ()\\\t]*))\(/, { token: "string.raw.begin", next: "@raw.$1" }]
        ],
        raw: [
          [/.*\)$S2\"/, "string.raw", "@pop"],
          [/.*/, "string.raw"]
        ]
      }
    }, configurationService));
    const lines = [
      `int main(){`,
      ``,
      `	auto s = R""""(`,
      `	Hello World`,
      `	)"""";`,
      ``,
      `	std::cout << "hello";`,
      ``,
      `}`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [new Token(0, "source.test", "test")],
      [],
      [new Token(0, "source.test", "test"), new Token(10, "string.raw.begin.test", "test")],
      [new Token(0, "string.raw.test", "test")],
      [new Token(0, "string.raw.test", "test"), new Token(6, "source.test", "test")],
      [],
      [new Token(0, "source.test", "test")],
      [],
      [new Token(0, "source.test", "test")]
    ]);
    disposables.dispose();
  });
  test("microsoft/monaco-editor#4775: Raw-strings in c++ can break monarch", () => {
    const disposables = new DisposableStore();
    const configurationService = new StandaloneConfigurationService(new NullLogService());
    const languageService = disposables.add(new LanguageService());
    const tokenizer = disposables.add(createMonarchTokenizer(languageService, "test", {
      ignoreCase: false,
      encoding: /u|u8|U|L/,
      tokenizer: {
        root: [
          // C++ 11 Raw String
          [/@encoding?R\"(?:([^ ()\\\t]*))\(/, { token: "string.raw.begin", next: "@raw.$1" }]
        ],
        raw: [
          [/.*\)$S2\"/, "string.raw", "@pop"],
          [/.*/, "string.raw"]
        ]
      }
    }, configurationService));
    const lines = [
      `R"[())"`
    ];
    const actualTokens = getTokens(tokenizer, lines);
    assert.deepStrictEqual(actualTokens, [
      [new Token(0, "string.raw.begin.test", "test"), new Token(4, "string.raw.test", "test")]
    ]);
    disposables.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL3Rlc3QvYnJvd3Nlci9tb25hcmNoLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUb2tlbiwgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zdGFuZGFsb25lU2VydmljZXMuanMnO1xuaW1wb3J0IHsgY29tcGlsZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb25hcmNoL21vbmFyY2hDb21waWxlLmpzJztcbmltcG9ydCB7IE1vbmFyY2hUb2tlbml6ZXIgfSBmcm9tICcuLi8uLi9jb21tb24vbW9uYXJjaC9tb25hcmNoTGV4ZXIuanMnO1xuaW1wb3J0IHsgSU1vbmFyY2hMYW5ndWFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb25hcmNoL21vbmFyY2hUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5zdWl0ZSgnTW9uYXJjaCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVNb25hcmNoVG9rZW5pemVyKGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgbGFuZ3VhZ2VJZDogc3RyaW5nLCBsYW5ndWFnZTogSU1vbmFyY2hMYW5ndWFnZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IE1vbmFyY2hUb2tlbml6ZXIge1xuXHRcdHJldHVybiBuZXcgTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsIG51bGwhLCBsYW5ndWFnZUlkLCBjb21waWxlKGxhbmd1YWdlSWQsIGxhbmd1YWdlKSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0VG9rZW5zKHRva2VuaXplcjogTW9uYXJjaFRva2VuaXplciwgbGluZXM6IHN0cmluZ1tdKTogVG9rZW5bXVtdIHtcblx0XHRjb25zdCBhY3R1YWxUb2tlbnM6IFRva2VuW11bXSA9IFtdO1xuXHRcdGxldCBzdGF0ZSA9IHRva2VuaXplci5nZXRJbml0aWFsU3RhdGUoKTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRva2VuaXplci50b2tlbml6ZShsaW5lLCB0cnVlLCBzdGF0ZSk7XG5cdFx0XHRhY3R1YWxUb2tlbnMucHVzaChyZXN1bHQudG9rZW5zKTtcblx0XHRcdHN0YXRlID0gcmVzdWx0LmVuZFN0YXRlO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0dWFsVG9rZW5zO1xuXHR9XG5cblx0dGVzdCgnRW5zdXJlIEByZW1hdGNoIGFuZCBuZXh0RW1iZWRkZWQgY2FuIGJlIHVzZWQgdG9nZXRoZXIgaW4gTW9uYXJjaCBncmFtbWFyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6ICdzcWwnIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoJ3NxbCcsIGRpc3Bvc2FibGVzLmFkZChjcmVhdGVNb25hcmNoVG9rZW5pemVyKGxhbmd1YWdlU2VydmljZSwgJ3NxbCcsIHtcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0Wy8uLywgJ3Rva2VuJ11cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpKTtcblx0XHRjb25zdCBTUUxfUVVFUllfU1RBUlQgPSAnKFNFTEVDVHxJTlNFUlR8VVBEQVRFfERFTEVURXxDUkVBVEV8UkVQTEFDRXxBTFRFUnxXSVRIKSc7XG5cdFx0Y29uc3QgdG9rZW5pemVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAndGVzdDEnLCB7XG5cdFx0XHR0b2tlbml6ZXI6IHtcblx0XHRcdFx0cm9vdDogW1xuXHRcdFx0XHRcdFtgKFxcXCJcXFwiXFxcIikke1NRTF9RVUVSWV9TVEFSVH1gLCBbeyAndG9rZW4nOiAnc3RyaW5nLnF1b3RlJywgfSwgeyB0b2tlbjogJ0ByZW1hdGNoJywgbmV4dDogJ0BlbmRTdHJpbmdXaXRoU1FMJywgbmV4dEVtYmVkZGVkOiAnc3FsJywgfSxdXSxcblx0XHRcdFx0XHRbLyhcIlwiXCIpJC8sIFt7IHRva2VuOiAnc3RyaW5nLnF1b3RlJywgbmV4dDogJ0BtYXliZVN0cmluZ0lzU1FMJywgfSxdXSxcblx0XHRcdFx0XSxcblx0XHRcdFx0bWF5YmVTdHJpbmdJc1NRTDogW1xuXHRcdFx0XHRcdFsvKC4qKS8sIHtcblx0XHRcdFx0XHRcdGNhc2VzOiB7XG5cdFx0XHRcdFx0XHRcdFtgJHtTUUxfUVVFUllfU1RBUlR9XFxcXGIuKmBdOiB7IHRva2VuOiAnQHJlbWF0Y2gnLCBuZXh0OiAnQGVuZFN0cmluZ1dpdGhTUUwnLCBuZXh0RW1iZWRkZWQ6ICdzcWwnLCB9LFxuXHRcdFx0XHRcdFx0XHQnQGRlZmF1bHQnOiB7IHRva2VuOiAnQHJlbWF0Y2gnLCBzd2l0Y2hUbzogJ0BlbmREYmxEb2NTdHJpbmcnLCB9LFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRlbmREYmxEb2NTdHJpbmc6IFtcblx0XHRcdFx0XHRbJ1teXFwnXSsnLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0WydcXFxcXFxcXFxcJycsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRbJ1xcJ1xcJ1xcJycsICdzdHJpbmcnLCAnQHBvcGFsbCddLFxuXHRcdFx0XHRcdFsnXFwnJywgJ3N0cmluZyddXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGVuZFN0cmluZ1dpdGhTUUw6IFtbL1wiXCJcIi8sIHsgdG9rZW46ICdzdHJpbmcucXVvdGUnLCBuZXh0OiAnQHBvcGFsbCcsIG5leHRFbWJlZGRlZDogJ0Bwb3AnLCB9LF1dLFxuXHRcdFx0fVxuXHRcdH0sIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHRcdGBteXNxbF9xdWVyeShcIlwiXCJTRUxFQ1QgKiBGUk9NIHRhYmxlX25hbWUgV0hFUkUgZHMgPSAnPERBVEVJRD4nXCJcIlwiKWAsXG5cdFx0XHRgbXlzcWxfcXVlcnkoXCJcIlwiYCxcblx0XHRcdGBTRUxFQ1QgKmAsXG5cdFx0XHRgRlJPTSB0YWJsZV9uYW1lYCxcblx0XHRcdGBXSEVSRSBkcyA9ICc8REFURUlEPidgLFxuXHRcdFx0YFwiXCJcIilgLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMgPSBnZXRUb2tlbnModG9rZW5pemVyLCBsaW5lcyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFRva2VucywgW1xuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3NvdXJjZS50ZXN0MScsICd0ZXN0MScpLFxuXHRcdFx0XHRuZXcgVG9rZW4oMTIsICdzdHJpbmcucXVvdGUudGVzdDEnLCAndGVzdDEnKSxcblx0XHRcdFx0bmV3IFRva2VuKDE1LCAndG9rZW4uc3FsJywgJ3NxbCcpLFxuXHRcdFx0XHRuZXcgVG9rZW4oNjEsICdzdHJpbmcucXVvdGUudGVzdDEnLCAndGVzdDEnKSxcblx0XHRcdFx0bmV3IFRva2VuKDY0LCAnc291cmNlLnRlc3QxJywgJ3Rlc3QxJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnc291cmNlLnRlc3QxJywgJ3Rlc3QxJyksXG5cdFx0XHRcdG5ldyBUb2tlbigxMiwgJ3N0cmluZy5xdW90ZS50ZXN0MScsICd0ZXN0MScpXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3Rva2VuLnNxbCcsICdzcWwnKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICd0b2tlbi5zcWwnLCAnc3FsJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAndG9rZW4uc3FsJywgJ3NxbCcpXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3N0cmluZy5xdW90ZS50ZXN0MScsICd0ZXN0MScpLFxuXHRcdFx0XHRuZXcgVG9rZW4oMywgJ3NvdXJjZS50ZXN0MScsICd0ZXN0MScpXG5cdFx0XHRdXG5cdFx0XSk7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IG5leHRFbWJlZGRlZDogXCJAcG9wXCIgaW4gY2FzZXMgc3RhdGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6ICdzcWwnIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoJ3NxbCcsIGRpc3Bvc2FibGVzLmFkZChjcmVhdGVNb25hcmNoVG9rZW5pemVyKGxhbmd1YWdlU2VydmljZSwgJ3NxbCcsIHtcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0Wy8uLywgJ3Rva2VuJ11cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpKTtcblx0XHRjb25zdCBTUUxfUVVFUllfU1RBUlQgPSAnKFNFTEVDVHxJTlNFUlR8VVBEQVRFfERFTEVURXxDUkVBVEV8UkVQTEFDRXxBTFRFUnxXSVRIKSc7XG5cdFx0Y29uc3QgdG9rZW5pemVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAndGVzdDEnLCB7XG5cdFx0XHR0b2tlbml6ZXI6IHtcblx0XHRcdFx0cm9vdDogW1xuXHRcdFx0XHRcdFtgKFxcXCJcXFwiXFxcIikke1NRTF9RVUVSWV9TVEFSVH1gLCBbeyAndG9rZW4nOiAnc3RyaW5nLnF1b3RlJywgfSwgeyB0b2tlbjogJ0ByZW1hdGNoJywgbmV4dDogJ0BlbmRTdHJpbmdXaXRoU1FMJywgbmV4dEVtYmVkZGVkOiAnc3FsJywgfSxdXSxcblx0XHRcdFx0XHRbLyhcIlwiXCIpJC8sIFt7IHRva2VuOiAnc3RyaW5nLnF1b3RlJywgbmV4dDogJ0BtYXliZVN0cmluZ0lzU1FMJywgfSxdXSxcblx0XHRcdFx0XSxcblx0XHRcdFx0bWF5YmVTdHJpbmdJc1NRTDogW1xuXHRcdFx0XHRcdFsvKC4qKS8sIHtcblx0XHRcdFx0XHRcdGNhc2VzOiB7XG5cdFx0XHRcdFx0XHRcdFtgJHtTUUxfUVVFUllfU1RBUlR9XFxcXGIuKmBdOiB7IHRva2VuOiAnQHJlbWF0Y2gnLCBuZXh0OiAnQGVuZFN0cmluZ1dpdGhTUUwnLCBuZXh0RW1iZWRkZWQ6ICdzcWwnLCB9LFxuXHRcdFx0XHRcdFx0XHQnQGRlZmF1bHQnOiB7IHRva2VuOiAnQHJlbWF0Y2gnLCBzd2l0Y2hUbzogJ0BlbmREYmxEb2NTdHJpbmcnLCB9LFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRlbmREYmxEb2NTdHJpbmc6IFtcblx0XHRcdFx0XHRbJ1teXFwnXSsnLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0WydcXFxcXFxcXFxcJycsICdzdHJpbmcnXSxcblx0XHRcdFx0XHRbJ1xcJ1xcJ1xcJycsICdzdHJpbmcnLCAnQHBvcGFsbCddLFxuXHRcdFx0XHRcdFsnXFwnJywgJ3N0cmluZyddXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGVuZFN0cmluZ1dpdGhTUUw6IFtbL1wiXCJcIi8sIHtcblx0XHRcdFx0XHRjYXNlczoge1xuXHRcdFx0XHRcdFx0J1wiXCJcIic6IHtcblx0XHRcdFx0XHRcdFx0Y2FzZXM6IHtcblx0XHRcdFx0XHRcdFx0XHQnJzogeyB0b2tlbjogJ3N0cmluZy5xdW90ZScsIG5leHQ6ICdAcG9wYWxsJywgbmV4dEVtYmVkZGVkOiAnQHBvcCcsIH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdAZGVmYXVsdCc6ICcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XV0sXG5cdFx0XHR9XG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0YG15c3FsX3F1ZXJ5KFwiXCJcIlNFTEVDVCAqIEZST00gdGFibGVfbmFtZSBXSEVSRSBkcyA9ICc8REFURUlEPidcIlwiXCIpYCxcblx0XHRcdGBteXNxbF9xdWVyeShcIlwiXCJgLFxuXHRcdFx0YFNFTEVDVCAqYCxcblx0XHRcdGBGUk9NIHRhYmxlX25hbWVgLFxuXHRcdFx0YFdIRVJFIGRzID0gJzxEQVRFSUQ+J2AsXG5cdFx0XHRgXCJcIlwiKWAsXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VucyA9IGdldFRva2Vucyh0b2tlbml6ZXIsIGxpbmVzKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVG9rZW5zLCBbXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnc291cmNlLnRlc3QxJywgJ3Rlc3QxJyksXG5cdFx0XHRcdG5ldyBUb2tlbigxMiwgJ3N0cmluZy5xdW90ZS50ZXN0MScsICd0ZXN0MScpLFxuXHRcdFx0XHRuZXcgVG9rZW4oMTUsICd0b2tlbi5zcWwnLCAnc3FsJyksXG5cdFx0XHRcdG5ldyBUb2tlbig2MSwgJ3N0cmluZy5xdW90ZS50ZXN0MScsICd0ZXN0MScpLFxuXHRcdFx0XHRuZXcgVG9rZW4oNjQsICdzb3VyY2UudGVzdDEnLCAndGVzdDEnKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICdzb3VyY2UudGVzdDEnLCAndGVzdDEnKSxcblx0XHRcdFx0bmV3IFRva2VuKDEyLCAnc3RyaW5nLnF1b3RlLnRlc3QxJywgJ3Rlc3QxJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAndG9rZW4uc3FsJywgJ3NxbCcpXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3Rva2VuLnNxbCcsICdzcWwnKVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICd0b2tlbi5zcWwnLCAnc3FsJylcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnc3RyaW5nLnF1b3RlLnRlc3QxJywgJ3Rlc3QxJyksXG5cdFx0XHRcdG5ldyBUb2tlbigzLCAnc291cmNlLnRlc3QxJywgJ3Rlc3QxJylcblx0XHRcdF1cblx0XHRdKTtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cblx0dGVzdCgnbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjMTIzNTogRW1wdHkgTGluZSBIYW5kbGluZycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHRva2VuaXplciA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVNb25hcmNoVG9rZW5pemVyKGxhbmd1YWdlU2VydmljZSwgJ3Rlc3QnLCB7XG5cdFx0XHR0b2tlbml6ZXI6IHtcblx0XHRcdFx0cm9vdDogW1xuXHRcdFx0XHRcdHsgaW5jbHVkZTogJ0Bjb21tZW50cycgfSxcblx0XHRcdFx0XSxcblxuXHRcdFx0XHRjb21tZW50czogW1xuXHRcdFx0XHRcdFsvXFwvXFwvJC8sICdjb21tZW50J10sIC8vIGVtcHR5IHNpbmdsZS1saW5lIGNvbW1lbnRcblx0XHRcdFx0XHRbL1xcL1xcLy8sICdjb21tZW50JywgJ0Bjb21tZW50X2NwcCddLFxuXHRcdFx0XHRdLFxuXG5cdFx0XHRcdGNvbW1lbnRfY3BwOiBbXG5cdFx0XHRcdFx0Wy8oPzpbXlxcXFxdfCg/OlxcXFwuKSkrJC8sICdjb21tZW50JywgJ0Bwb3AnXSxcblx0XHRcdFx0XHRbLy4rJC8sICdjb21tZW50J10sXG5cdFx0XHRcdFx0Wy8kLywgJ2NvbW1lbnQnLCAnQHBvcCddXG5cdFx0XHRcdFx0Ly8gTm8gcG9zc2libGUgcnVsZSB0byBkZXRlY3QgYW4gZW1wdHkgbGluZSBhbmQgQHBvcD9cblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0YC8vIFRoaXMgY29tbWVudCBcXFxcYCxcblx0XHRcdGAgICBjb250aW51ZXMgb24gdGhlIGZvbGxvd2luZyBsaW5lYCxcblx0XHRcdGBgLFxuXHRcdFx0YC8vIFRoaXMgY29tbWVudCBkb2VzIE5PVCBjb250aW51ZSBcXFxcXFxcXGAsXG5cdFx0XHRgICAgYmVjYXVzZSB0aGUgZXNjYXBlIGNoYXIgd2FzIGl0c2VsZiBlc2NhcGVkYCxcblx0XHRcdGBgLFxuXHRcdFx0YC8vIFRoaXMgY29tbWVudCBET0VTIGNvbnRpbnVlIGJlY2F1c2UgXFxcXFxcXFxcXFxcYCxcblx0XHRcdGAgICB0aGUgMXN0ICdcXFxcJyBlc2NhcGVzIHRoZSAybmQ7IHRoZSAzcmQgZXNjYXBlcyBFT0xgLFxuXHRcdFx0YGAsXG5cdFx0XHRgLy8gVGhpcyBjb21tZW50IGNvbnRpbnVlcyB0byB0aGUgZm9sbG93aW5nIGxpbmUgXFxcXGAsXG5cdFx0XHRgYCxcblx0XHRcdGBCdXQgdGhlIGxpbmUgd2FzIGVtcHR5LiBUaGlzIGxpbmUgc2hvdWxkIG5vdCBiZSBjb21tZW50ZWQuYCxcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsVG9rZW5zID0gZ2V0VG9rZW5zKHRva2VuaXplciwgbGluZXMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxUb2tlbnMsIFtcblx0XHRcdFtuZXcgVG9rZW4oMCwgJ2NvbW1lbnQudGVzdCcsICd0ZXN0JyldLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnY29tbWVudC50ZXN0JywgJ3Rlc3QnKV0sXG5cdFx0XHRbXSxcblx0XHRcdFtuZXcgVG9rZW4oMCwgJ2NvbW1lbnQudGVzdCcsICd0ZXN0JyldLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnc291cmNlLnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtdLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnY29tbWVudC50ZXN0JywgJ3Rlc3QnKV0sXG5cdFx0XHRbbmV3IFRva2VuKDAsICdjb21tZW50LnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtdLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnY29tbWVudC50ZXN0JywgJ3Rlc3QnKV0sXG5cdFx0XHRbXSxcblx0XHRcdFtuZXcgVG9rZW4oMCwgJ3NvdXJjZS50ZXN0JywgJ3Rlc3QnKV1cblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjMjI2NTogRXhpdCBhIHN0YXRlIGF0IGVuZCBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgdG9rZW5pemVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAndGVzdCcsIHtcblx0XHRcdGluY2x1ZGVMRjogdHJ1ZSxcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0Wy9eXFwqLywgJycsICdAaW5uZXInXSxcblx0XHRcdFx0XHRbL1xcOlxcKi8sICcnLCAnQGlubmVyJ10sXG5cdFx0XHRcdFx0Wy9bXio6XSsvLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0Wy9bKjpdLywgJ3N0cmluZyddXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGlubmVyOiBbXG5cdFx0XHRcdFx0Wy9cXG4vLCAnJywgJ0Bwb3AnXSxcblx0XHRcdFx0XHRbL1xcZCsvLCAnbnVtYmVyJ10sXG5cdFx0XHRcdFx0Wy9bXlxcZF0rLywgJyddXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSBbXG5cdFx0XHRgUFJJTlQgMTAgKiAyMGAsXG5cdFx0XHRgKkZYMjAwLCAzYCxcblx0XHRcdGBQUklOVCAyKjM6KkZYMjAwLCAzYFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMgPSBnZXRUb2tlbnModG9rZW5pemVyLCBsaW5lcyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFRva2VucywgW1xuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3N0cmluZy50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnJywgJ3Rlc3QnKSxcblx0XHRcdFx0bmV3IFRva2VuKDMsICdudW1iZXIudGVzdCcsICd0ZXN0JyksXG5cdFx0XHRcdG5ldyBUb2tlbig2LCAnJywgJ3Rlc3QnKSxcblx0XHRcdFx0bmV3IFRva2VuKDgsICdudW1iZXIudGVzdCcsICd0ZXN0JyksXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJ3N0cmluZy50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdFx0bmV3IFRva2VuKDksICcnLCAndGVzdCcpLFxuXHRcdFx0XHRuZXcgVG9rZW4oMTMsICdudW1iZXIudGVzdCcsICd0ZXN0JyksXG5cdFx0XHRcdG5ldyBUb2tlbigxNiwgJycsICd0ZXN0JyksXG5cdFx0XHRcdG5ldyBUb2tlbigxOCwgJ251bWJlci50ZXN0JywgJ3Rlc3QnKSxcblx0XHRcdF1cblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExNTY2MjogbW9uYXJjaENvbXBpbGUgZnVuY3Rpb24gbmVlZCBhbiBleHRyYSBvcHRpb24gd2hpY2ggY2FuIGNvbnRyb2wgcmVwbGFjZW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgU3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IExhbmd1YWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHRva2VuaXplcjEgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0Jywge1xuXHRcdFx0aWdub3JlQ2FzZTogZmFsc2UsXG5cdFx0XHR1c2VsZXNzUmVwbGFjZUtleTE6ICdAdXNlbGVzc1JlcGxhY2VLZXkyJyxcblx0XHRcdHVzZWxlc3NSZXBsYWNlS2V5MjogJ0B1c2VsZXNzUmVwbGFjZUtleTMnLFxuXHRcdFx0dXNlbGVzc1JlcGxhY2VLZXkzOiAnQHVzZWxlc3NSZXBsYWNlS2V5NCcsXG5cdFx0XHR1c2VsZXNzUmVwbGFjZUtleTQ6ICdAdXNlbGVzc1JlcGxhY2VLZXk1Jyxcblx0XHRcdHVzZWxlc3NSZXBsYWNlS2V5NTogJ0BoYW0nLFxuXHRcdFx0dG9rZW5pemVyOiB7XG5cdFx0XHRcdHJvb3Q6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyZWdleDogL0BcXHcrLy50ZXN0KCdAaGFtJylcblx0XHRcdFx0XHRcdFx0PyBuZXcgUmVnRXhwKGBeJHsnQHVzZWxlc3NSZXBsYWNlS2V5MSd9JGApXG5cdFx0XHRcdFx0XHRcdDogbmV3IFJlZ0V4cChgXiR7J0BoYW0nfSRgKSxcblx0XHRcdFx0XHRcdGFjdGlvbjogeyB0b2tlbjogJ2hhbScgfVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH0sIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cblx0XHRjb25zdCB0b2tlbml6ZXIyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAndGVzdCcsIHtcblx0XHRcdGlnbm9yZUNhc2U6IGZhbHNlLFxuXHRcdFx0dG9rZW5pemVyOiB7XG5cdFx0XHRcdHJvb3Q6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyZWdleDogL0BAaGFtLyxcblx0XHRcdFx0XHRcdGFjdGlvbjogeyB0b2tlbjogJ2hhbScgfVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH0sIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHRcdGBAaGFtYFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMxID0gZ2V0VG9rZW5zKHRva2VuaXplcjEsIGxpbmVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFRva2VuczEsIFtcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICdoYW0udGVzdCcsICd0ZXN0JyksXG5cdFx0XHRdXG5cdFx0XSk7XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMyID0gZ2V0VG9rZW5zKHRva2VuaXplcjIsIGxpbmVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFRva2VuczIsIFtcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICdoYW0udGVzdCcsICd0ZXN0JyksXG5cdFx0XHRdXG5cdFx0XSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pY3Jvc29mdC9tb25hY28tZWRpdG9yIzI0MjQ6IEFsbG93IHRvIHRhcmdldCBAQCcsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgdG9rZW5pemVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAndGVzdCcsIHtcblx0XHRcdGlnbm9yZUNhc2U6IGZhbHNlLFxuXHRcdFx0dG9rZW5pemVyOiB7XG5cdFx0XHRcdHJvb3Q6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyZWdleDogL0BAQEAvLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7IHRva2VuOiAnaGFtJyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0YEBAYFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMgPSBnZXRUb2tlbnModG9rZW5pemVyLCBsaW5lcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxUb2tlbnMsIFtcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRva2VuKDAsICdoYW0udGVzdCcsICd0ZXN0JyksXG5cdFx0XHRdXG5cdFx0XSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pY3Jvc29mdC9tb25hY28tZWRpdG9yIzMwMjU6IENoZWNrIG1heFRva2VuaXphdGlvbkxpbmVMZW5ndGggYmVmb3JlIHRva2VuaXppbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Ly8gU2V0IG1heFRva2VuaXphdGlvbkxpbmVMZW5ndGggdG8gNCBzbyB0aGF0IFwiaGFtXCIgd29ya3MgYnV0IFwiaGFtaGFtXCIgd291bGQgZmFpbFxuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdlZGl0b3IubWF4VG9rZW5pemF0aW9uTGluZUxlbmd0aCcsIDQpO1xuXG5cdFx0Y29uc3QgdG9rZW5pemVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAndGVzdCcsIHtcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmVnZXg6IC9oYW0vLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7IHRva2VuOiAnaGFtJyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0J2hhbScsIC8vIGxlbmd0aCAzLCBzaG91bGQgYmUgdG9rZW5pemVkXG5cdFx0XHQnaGFtaGFtJyAvLyBsZW5ndGggNiwgc2hvdWxkIE5PVCBiZSB0b2tlbml6ZWRcblx0XHRdO1xuXG5cdFx0Y29uc3QgYWN0dWFsVG9rZW5zID0gZ2V0VG9rZW5zKHRva2VuaXplciwgbGluZXMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsVG9rZW5zLCBbXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUb2tlbigwLCAnaGFtLnRlc3QnLCAndGVzdCcpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHRuZXcgVG9rZW4oMCwgJycsICd0ZXN0Jylcblx0XHRcdF1cblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjMzEyODogYWxsb3cgc3RhdGUgYWNjZXNzIHdpdGhpbiBydWxlcycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgdG9rZW5pemVyID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZU1vbmFyY2hUb2tlbml6ZXIobGFuZ3VhZ2VTZXJ2aWNlLCAndGVzdCcsIHtcblx0XHRcdGlnbm9yZUNhc2U6IGZhbHNlLFxuXHRcdFx0ZW5jb2Rpbmc6IC91fHU4fFV8TC8sXG5cdFx0XHR0b2tlbml6ZXI6IHtcblx0XHRcdFx0cm9vdDogW1xuXHRcdFx0XHRcdC8vIEMrKyAxMSBSYXcgU3RyaW5nXG5cdFx0XHRcdFx0Wy9AZW5jb2Rpbmc/UlxcXCIoPzooW14gKClcXFxcXFx0XSopKVxcKC8sIHsgdG9rZW46ICdzdHJpbmcucmF3LmJlZ2luJywgbmV4dDogJ0ByYXcuJDEnIH1dLFxuXHRcdFx0XHRdLFxuXG5cdFx0XHRcdHJhdzogW1xuXHRcdFx0XHRcdFsvLipcXCkkUzJcXFwiLywgJ3N0cmluZy5yYXcnLCAnQHBvcCddLFxuXHRcdFx0XHRcdFsvLiovLCAnc3RyaW5nLnJhdyddXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH0sIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBsaW5lcyA9IFtcblx0XHRcdGBpbnQgbWFpbigpe2AsXG5cdFx0XHRgYCxcblx0XHRcdGBcdGF1dG8gcyA9IFJcIlwiXCJcIihgLFxuXHRcdFx0YFx0SGVsbG8gV29ybGRgLFxuXHRcdFx0YFx0KVwiXCJcIlwiO2AsXG5cdFx0XHRgYCxcblx0XHRcdGBcdHN0ZDo6Y291dCA8PCBcImhlbGxvXCI7YCxcblx0XHRcdGBgLFxuXHRcdFx0YH1gLFxuXHRcdF07XG5cblx0XHRjb25zdCBhY3R1YWxUb2tlbnMgPSBnZXRUb2tlbnModG9rZW5pemVyLCBsaW5lcyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxUb2tlbnMsIFtcblx0XHRcdFtuZXcgVG9rZW4oMCwgJ3NvdXJjZS50ZXN0JywgJ3Rlc3QnKV0sXG5cdFx0XHRbXSxcblx0XHRcdFtuZXcgVG9rZW4oMCwgJ3NvdXJjZS50ZXN0JywgJ3Rlc3QnKSwgbmV3IFRva2VuKDEwLCAnc3RyaW5nLnJhdy5iZWdpbi50ZXN0JywgJ3Rlc3QnKV0sXG5cdFx0XHRbbmV3IFRva2VuKDAsICdzdHJpbmcucmF3LnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtuZXcgVG9rZW4oMCwgJ3N0cmluZy5yYXcudGVzdCcsICd0ZXN0JyksIG5ldyBUb2tlbig2LCAnc291cmNlLnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtdLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnc291cmNlLnRlc3QnLCAndGVzdCcpXSxcblx0XHRcdFtdLFxuXHRcdFx0W25ldyBUb2tlbigwLCAnc291cmNlLnRlc3QnLCAndGVzdCcpXSxcblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjNDc3NTogUmF3LXN0cmluZ3MgaW4gYysrIGNhbiBicmVhayBtb25hcmNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBMYW5ndWFnZVNlcnZpY2UoKSk7XG5cblx0XHRjb25zdCB0b2tlbml6ZXIgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTW9uYXJjaFRva2VuaXplcihsYW5ndWFnZVNlcnZpY2UsICd0ZXN0Jywge1xuXHRcdFx0aWdub3JlQ2FzZTogZmFsc2UsXG5cdFx0XHRlbmNvZGluZzogL3V8dTh8VXxMLyxcblx0XHRcdHRva2VuaXplcjoge1xuXHRcdFx0XHRyb290OiBbXG5cdFx0XHRcdFx0Ly8gQysrIDExIFJhdyBTdHJpbmdcblx0XHRcdFx0XHRbL0BlbmNvZGluZz9SXFxcIig/OihbXiAoKVxcXFxcXHRdKikpXFwoLywgeyB0b2tlbjogJ3N0cmluZy5yYXcuYmVnaW4nLCBuZXh0OiAnQHJhdy4kMScgfV0sXG5cdFx0XHRcdF0sXG5cblx0XHRcdFx0cmF3OiBbXG5cdFx0XHRcdFx0Wy8uKlxcKSRTMlxcXCIvLCAnc3RyaW5nLnJhdycsICdAcG9wJ10sXG5cdFx0XHRcdFx0Wy8uKi8sICdzdHJpbmcucmF3J11cblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0fSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gW1xuXHRcdFx0YFJcIlsoKSlcImAsXG5cdFx0XTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VucyA9IGdldFRva2Vucyh0b2tlbml6ZXIsIGxpbmVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFRva2VucywgW1xuXHRcdFx0W25ldyBUb2tlbigwLCAnc3RyaW5nLnJhdy5iZWdpbi50ZXN0JywgJ3Rlc3QnKSwgbmV3IFRva2VuKDQsICdzdHJpbmcucmF3LnRlc3QnLCAndGVzdCcpXSxcblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsT0FBTyw0QkFBNEI7QUFFNUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCO0FBR2pDLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0sV0FBVyxNQUFNO0FBRXRCLDBDQUF3QztBQUV4QyxXQUFTLHVCQUF1QixpQkFBbUMsWUFBb0IsVUFBNEIsc0JBQStEO0FB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
