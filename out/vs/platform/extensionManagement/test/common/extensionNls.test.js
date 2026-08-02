import assert from "assert";
import { deepClone } from "../../../../base/common/objects.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { localizeManifest } from "../../common/extensionNls.js";
import { NullLogger } from "../../../log/common/log.js";
const manifest = {
  name: "test",
  publisher: "test",
  version: "1.0.0",
  engines: {
    vscode: "*"
  },
  contributes: {
    commands: [
      {
        command: "test.command",
        title: "%test.command.title%",
        category: "%test.command.category%"
      }
    ],
    authentication: [
      {
        id: "test.authentication",
        label: "%test.authentication.label%"
      }
    ],
    configuration: {
      // to ensure we test another "title" property
      title: "%test.configuration.title%",
      properties: {
        "test.configuration": {
          type: "string",
          description: "not important"
        }
      }
    }
  }
};
suite("Localize Manifest", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("replaces template strings", function() {
    const localizedManifest = localizeManifest(
      store.add(new NullLogger()),
      deepClone(manifest),
      {
        "test.command.title": "Test Command",
        "test.command.category": "Test Category",
        "test.authentication.label": "Test Authentication",
        "test.configuration.title": "Test Configuration"
      }
    );
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, "Test Command");
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, "Test Category");
    assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, "Test Authentication");
    assert.strictEqual((localizedManifest.contributes?.configuration).title, "Test Configuration");
  });
  test("replaces template strings with fallback if not found in translations", function() {
    const localizedManifest = localizeManifest(
      store.add(new NullLogger()),
      deepClone(manifest),
      {},
      {
        "test.command.title": "Test Command",
        "test.command.category": "Test Category",
        "test.authentication.label": "Test Authentication",
        "test.configuration.title": "Test Configuration"
      }
    );
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, "Test Command");
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, "Test Category");
    assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, "Test Authentication");
    assert.strictEqual((localizedManifest.contributes?.configuration).title, "Test Configuration");
  });
  test("replaces template strings - command title & categories become ILocalizedString", function() {
    const localizedManifest = localizeManifest(
      store.add(new NullLogger()),
      deepClone(manifest),
      {
        "test.command.title": "Befehl test",
        "test.command.category": "Testkategorie",
        "test.authentication.label": "Testauthentifizierung",
        "test.configuration.title": "Testkonfiguration"
      },
      {
        "test.command.title": "Test Command",
        "test.command.category": "Test Category",
        "test.authentication.label": "Test Authentication",
        "test.configuration.title": "Test Configuration"
      }
    );
    const title = localizedManifest.contributes?.commands?.[0].title;
    const category = localizedManifest.contributes?.commands?.[0].category;
    assert.strictEqual(title.value, "Befehl test");
    assert.strictEqual(title.original, "Test Command");
    assert.strictEqual(category.value, "Testkategorie");
    assert.strictEqual(category.original, "Test Category");
    assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, "Testauthentifizierung");
    assert.strictEqual((localizedManifest.contributes?.configuration).title, "Testkonfiguration");
  });
  test("replaces template strings - is best effort #164630", function() {
    const manifestWithTypo = {
      name: "test",
      publisher: "test",
      version: "1.0.0",
      engines: {
        vscode: "*"
      },
      contributes: {
        authentication: [
          {
            id: "test.authentication",
            // This not existing in the bundle shouldn't cause an error.
            label: "%doesnotexist%"
          }
        ],
        commands: [
          {
            command: "test.command",
            title: "%test.command.title%",
            category: "%test.command.category%"
          }
        ]
      }
    };
    const localizedManifest = localizeManifest(
      store.add(new NullLogger()),
      deepClone(manifestWithTypo),
      {
        "test.command.title": "Test Command",
        "test.command.category": "Test Category"
      }
    );
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].title, "Test Command");
    assert.strictEqual(localizedManifest.contributes?.commands?.[0].category, "Test Category");
    assert.strictEqual(localizedManifest.contributes?.authentication?.[0].label, "%doesnotexist%");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvdGVzdC9jb21tb24vZXh0ZW5zaW9uTmxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uTm9kZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZU1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dGVuc2lvbk5scy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE51bGxMb2dnZXIgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmNvbnN0IG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgPSB7XG5cdG5hbWU6ICd0ZXN0Jyxcblx0cHVibGlzaGVyOiAndGVzdCcsXG5cdHZlcnNpb246ICcxLjAuMCcsXG5cdGVuZ2luZXM6IHtcblx0XHR2c2NvZGU6ICcqJ1xuXHR9LFxuXHRjb250cmlidXRlczoge1xuXHRcdGNvbW1hbmRzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdGNvbW1hbmQ6ICd0ZXN0LmNvbW1hbmQnLFxuXHRcdFx0XHR0aXRsZTogJyV0ZXN0LmNvbW1hbmQudGl0bGUlJyxcblx0XHRcdFx0Y2F0ZWdvcnk6ICcldGVzdC5jb21tYW5kLmNhdGVnb3J5JSdcblx0XHRcdH0sXG5cdFx0XSxcblx0XHRhdXRoZW50aWNhdGlvbjogW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3Rlc3QuYXV0aGVudGljYXRpb24nLFxuXHRcdFx0XHRsYWJlbDogJyV0ZXN0LmF1dGhlbnRpY2F0aW9uLmxhYmVsJScsXG5cdFx0XHR9XG5cdFx0XSxcblx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHQvLyB0byBlbnN1cmUgd2UgdGVzdCBhbm90aGVyIFwidGl0bGVcIiBwcm9wZXJ0eVxuXHRcdFx0dGl0bGU6ICcldGVzdC5jb25maWd1cmF0aW9uLnRpdGxlJScsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCd0ZXN0LmNvbmZpZ3VyYXRpb24nOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdub3QgaW1wb3J0YW50Jyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufTtcblxuc3VpdGUoJ0xvY2FsaXplIE1hbmlmZXN0JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHR0ZXN0KCdyZXBsYWNlcyB0ZW1wbGF0ZSBzdHJpbmdzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGxvY2FsaXplZE1hbmlmZXN0ID0gbG9jYWxpemVNYW5pZmVzdChcblx0XHRcdHN0b3JlLmFkZChuZXcgTnVsbExvZ2dlcigpKSxcblx0XHRcdGRlZXBDbG9uZShtYW5pZmVzdCksXG5cdFx0XHR7XG5cdFx0XHRcdCd0ZXN0LmNvbW1hbmQudGl0bGUnOiAnVGVzdCBDb21tYW5kJyxcblx0XHRcdFx0J3Rlc3QuY29tbWFuZC5jYXRlZ29yeSc6ICdUZXN0IENhdGVnb3J5Jyxcblx0XHRcdFx0J3Rlc3QuYXV0aGVudGljYXRpb24ubGFiZWwnOiAnVGVzdCBBdXRoZW50aWNhdGlvbicsXG5cdFx0XHRcdCd0ZXN0LmNvbmZpZ3VyYXRpb24udGl0bGUnOiAnVGVzdCBDb25maWd1cmF0aW9uJyxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb21tYW5kcz8uWzBdLnRpdGxlLCAnVGVzdCBDb21tYW5kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb21tYW5kcz8uWzBdLmNhdGVnb3J5LCAnVGVzdCBDYXRlZ29yeScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uYXV0aGVudGljYXRpb24/LlswXS5sYWJlbCwgJ1Rlc3QgQXV0aGVudGljYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb25maWd1cmF0aW9uIGFzIElDb25maWd1cmF0aW9uTm9kZSkudGl0bGUsICdUZXN0IENvbmZpZ3VyYXRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgdGVtcGxhdGUgc3RyaW5ncyB3aXRoIGZhbGxiYWNrIGlmIG5vdCBmb3VuZCBpbiB0cmFuc2xhdGlvbnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgbG9jYWxpemVkTWFuaWZlc3QgPSBsb2NhbGl6ZU1hbmlmZXN0KFxuXHRcdFx0c3RvcmUuYWRkKG5ldyBOdWxsTG9nZ2VyKCkpLFxuXHRcdFx0ZGVlcENsb25lKG1hbmlmZXN0KSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHQndGVzdC5jb21tYW5kLnRpdGxlJzogJ1Rlc3QgQ29tbWFuZCcsXG5cdFx0XHRcdCd0ZXN0LmNvbW1hbmQuY2F0ZWdvcnknOiAnVGVzdCBDYXRlZ29yeScsXG5cdFx0XHRcdCd0ZXN0LmF1dGhlbnRpY2F0aW9uLmxhYmVsJzogJ1Rlc3QgQXV0aGVudGljYXRpb24nLFxuXHRcdFx0XHQndGVzdC5jb25maWd1cmF0aW9uLnRpdGxlJzogJ1Rlc3QgQ29uZmlndXJhdGlvbicsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uY29tbWFuZHM/LlswXS50aXRsZSwgJ1Rlc3QgQ29tbWFuZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uY29tbWFuZHM/LlswXS5jYXRlZ29yeSwgJ1Rlc3QgQ2F0ZWdvcnknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmF1dGhlbnRpY2F0aW9uPy5bMF0ubGFiZWwsICdUZXN0IEF1dGhlbnRpY2F0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbiBhcyBJQ29uZmlndXJhdGlvbk5vZGUpLnRpdGxlLCAnVGVzdCBDb25maWd1cmF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIHRlbXBsYXRlIHN0cmluZ3MgLSBjb21tYW5kIHRpdGxlICYgY2F0ZWdvcmllcyBiZWNvbWUgSUxvY2FsaXplZFN0cmluZycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBsb2NhbGl6ZWRNYW5pZmVzdCA9IGxvY2FsaXplTWFuaWZlc3QoXG5cdFx0XHRzdG9yZS5hZGQobmV3IE51bGxMb2dnZXIoKSksXG5cdFx0XHRkZWVwQ2xvbmUobWFuaWZlc3QpLFxuXHRcdFx0e1xuXHRcdFx0XHQndGVzdC5jb21tYW5kLnRpdGxlJzogJ0JlZmVobCB0ZXN0Jyxcblx0XHRcdFx0J3Rlc3QuY29tbWFuZC5jYXRlZ29yeSc6ICdUZXN0a2F0ZWdvcmllJyxcblx0XHRcdFx0J3Rlc3QuYXV0aGVudGljYXRpb24ubGFiZWwnOiAnVGVzdGF1dGhlbnRpZml6aWVydW5nJyxcblx0XHRcdFx0J3Rlc3QuY29uZmlndXJhdGlvbi50aXRsZSc6ICdUZXN0a29uZmlndXJhdGlvbicsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHQndGVzdC5jb21tYW5kLnRpdGxlJzogJ1Rlc3QgQ29tbWFuZCcsXG5cdFx0XHRcdCd0ZXN0LmNvbW1hbmQuY2F0ZWdvcnknOiAnVGVzdCBDYXRlZ29yeScsXG5cdFx0XHRcdCd0ZXN0LmF1dGhlbnRpY2F0aW9uLmxhYmVsJzogJ1Rlc3QgQXV0aGVudGljYXRpb24nLFxuXHRcdFx0XHQndGVzdC5jb25maWd1cmF0aW9uLnRpdGxlJzogJ1Rlc3QgQ29uZmlndXJhdGlvbicsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IHRpdGxlID0gbG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbW1hbmRzPy5bMF0udGl0bGUgYXMgSUxvY2FsaXplZFN0cmluZztcblx0XHRjb25zdCBjYXRlZ29yeSA9IGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb21tYW5kcz8uWzBdLmNhdGVnb3J5IGFzIElMb2NhbGl6ZWRTdHJpbmc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRpdGxlLnZhbHVlLCAnQmVmZWhsIHRlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGl0bGUub3JpZ2luYWwsICdUZXN0IENvbW1hbmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2F0ZWdvcnkudmFsdWUsICdUZXN0a2F0ZWdvcmllJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhdGVnb3J5Lm9yaWdpbmFsLCAnVGVzdCBDYXRlZ29yeScpO1xuXG5cdFx0Ly8gRXZlcnl0aGluZyBlbHNlIHN0YXlzIGFzIGEgc3RyaW5nLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbGl6ZWRNYW5pZmVzdC5jb250cmlidXRlcz8uYXV0aGVudGljYXRpb24/LlswXS5sYWJlbCwgJ1Rlc3RhdXRoZW50aWZpemllcnVuZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgobG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbmZpZ3VyYXRpb24gYXMgSUNvbmZpZ3VyYXRpb25Ob2RlKS50aXRsZSwgJ1Rlc3Rrb25maWd1cmF0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIHRlbXBsYXRlIHN0cmluZ3MgLSBpcyBiZXN0IGVmZm9ydCAjMTY0NjMwJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1hbmlmZXN0V2l0aFR5cG86IElFeHRlbnNpb25NYW5pZmVzdCA9IHtcblx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdHB1Ymxpc2hlcjogJ3Rlc3QnLFxuXHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdGVuZ2luZXM6IHtcblx0XHRcdFx0dnNjb2RlOiAnKidcblx0XHRcdH0sXG5cdFx0XHRjb250cmlidXRlczoge1xuXHRcdFx0XHRhdXRoZW50aWNhdGlvbjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiAndGVzdC5hdXRoZW50aWNhdGlvbicsXG5cdFx0XHRcdFx0XHQvLyBUaGlzIG5vdCBleGlzdGluZyBpbiB0aGUgYnVuZGxlIHNob3VsZG4ndCBjYXVzZSBhbiBlcnJvci5cblx0XHRcdFx0XHRcdGxhYmVsOiAnJWRvZXNub3RleGlzdCUnLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y29tbWFuZHM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRjb21tYW5kOiAndGVzdC5jb21tYW5kJyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnJXRlc3QuY29tbWFuZC50aXRsZSUnLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6ICcldGVzdC5jb21tYW5kLmNhdGVnb3J5JSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBsb2NhbGl6ZWRNYW5pZmVzdCA9IGxvY2FsaXplTWFuaWZlc3QoXG5cdFx0XHRzdG9yZS5hZGQobmV3IE51bGxMb2dnZXIoKSksXG5cdFx0XHRkZWVwQ2xvbmUobWFuaWZlc3RXaXRoVHlwbyksXG5cdFx0XHR7XG5cdFx0XHRcdCd0ZXN0LmNvbW1hbmQudGl0bGUnOiAnVGVzdCBDb21tYW5kJyxcblx0XHRcdFx0J3Rlc3QuY29tbWFuZC5jYXRlZ29yeSc6ICdUZXN0IENhdGVnb3J5J1xuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbW1hbmRzPy5bMF0udGl0bGUsICdUZXN0IENvbW1hbmQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWxpemVkTWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbW1hbmRzPy5bMF0uY2F0ZWdvcnksICdUZXN0IENhdGVnb3J5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvY2FsaXplZE1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5hdXRoZW50aWNhdGlvbj8uWzBdLmxhYmVsLCAn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
