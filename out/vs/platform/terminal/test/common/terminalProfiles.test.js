import { deepStrictEqual } from "assert";
import { Codicon } from "../../../../base/common/codicons.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { createProfileSchemaEnums } from "../../common/terminalProfiles.js";
suite("terminalProfiles", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("createProfileSchemaEnums", () => {
    test("should return an empty array when there are no profiles", () => {
      deepStrictEqual(createProfileSchemaEnums([]), {
        values: [
          null
        ],
        markdownDescriptions: [
          "Automatically detect the default"
        ]
      });
    });
    test("should return a single entry when there is one profile", () => {
      const profile = {
        profileName: "name",
        path: "path",
        isDefault: true
      };
      deepStrictEqual(createProfileSchemaEnums([profile]), {
        values: [
          null,
          "name"
        ],
        markdownDescriptions: [
          "Automatically detect the default",
          "$(terminal) name\n- path: path"
        ]
      });
    });
    test("should show all profile information", () => {
      const profile = {
        profileName: "name",
        path: "path",
        isDefault: true,
        args: ["a", "b"],
        color: "terminal.ansiRed",
        env: {
          c: "d",
          e: "f"
        },
        icon: Codicon.zap,
        overrideName: true
      };
      deepStrictEqual(createProfileSchemaEnums([profile]), {
        values: [
          null,
          "name"
        ],
        markdownDescriptions: [
          "Automatically detect the default",
          `$(zap) name
- path: path
- args: ['a','b']
- overrideName: true
- color: terminal.ansiRed
- env: {"c":"d","e":"f"}`
        ]
      });
    });
    test("should return a multiple entries when there are multiple profiles", () => {
      const profile1 = {
        profileName: "name",
        path: "path",
        isDefault: true
      };
      const profile2 = {
        profileName: "foo",
        path: "bar",
        isDefault: false
      };
      deepStrictEqual(createProfileSchemaEnums([profile1, profile2]), {
        values: [
          null,
          "name",
          "foo"
        ],
        markdownDescriptions: [
          "Automatically detect the default",
          "$(terminal) name\n- path: path",
          "$(terminal) foo\n- path: bar"
        ]
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsUHJvZmlsZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGNyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcyB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbFByb2ZpbGVzLmpzJztcblxuc3VpdGUoJ3Rlcm1pbmFsUHJvZmlsZXMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdjcmVhdGVQcm9maWxlU2NoZW1hRW51bXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBhbiBlbXB0eSBhcnJheSB3aGVuIHRoZXJlIGFyZSBubyBwcm9maWxlcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChjcmVhdGVQcm9maWxlU2NoZW1hRW51bXMoW10pLCB7XG5cdFx0XHRcdHZhbHVlczogW1xuXHRcdFx0XHRcdG51bGxcblx0XHRcdFx0XSxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHQnQXV0b21hdGljYWxseSBkZXRlY3QgdGhlIGRlZmF1bHQnXG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gYSBzaW5nbGUgZW50cnkgd2hlbiB0aGVyZSBpcyBvbmUgcHJvZmlsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2ZpbGU6IElUZXJtaW5hbFByb2ZpbGUgPSB7XG5cdFx0XHRcdHByb2ZpbGVOYW1lOiAnbmFtZScsXG5cdFx0XHRcdHBhdGg6ICdwYXRoJyxcblx0XHRcdFx0aXNEZWZhdWx0OiB0cnVlXG5cdFx0XHR9O1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcyhbcHJvZmlsZV0pLCB7XG5cdFx0XHRcdHZhbHVlczogW1xuXHRcdFx0XHRcdG51bGwsXG5cdFx0XHRcdFx0J25hbWUnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0J0F1dG9tYXRpY2FsbHkgZGV0ZWN0IHRoZSBkZWZhdWx0Jyxcblx0XHRcdFx0XHQnJCh0ZXJtaW5hbCkgbmFtZVxcbi0gcGF0aDogcGF0aCdcblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHNob3cgYWxsIHByb2ZpbGUgaW5mb3JtYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9maWxlOiBJVGVybWluYWxQcm9maWxlID0ge1xuXHRcdFx0XHRwcm9maWxlTmFtZTogJ25hbWUnLFxuXHRcdFx0XHRwYXRoOiAncGF0aCcsXG5cdFx0XHRcdGlzRGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0YXJnczogWydhJywgJ2InXSxcblx0XHRcdFx0Y29sb3I6ICd0ZXJtaW5hbC5hbnNpUmVkJyxcblx0XHRcdFx0ZW52OiB7XG5cdFx0XHRcdFx0YzogJ2QnLFxuXHRcdFx0XHRcdGU6ICdmJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnphcCxcblx0XHRcdFx0b3ZlcnJpZGVOYW1lOiB0cnVlXG5cdFx0XHR9O1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNyZWF0ZVByb2ZpbGVTY2hlbWFFbnVtcyhbcHJvZmlsZV0pLCB7XG5cdFx0XHRcdHZhbHVlczogW1xuXHRcdFx0XHRcdG51bGwsXG5cdFx0XHRcdFx0J25hbWUnXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0J0F1dG9tYXRpY2FsbHkgZGV0ZWN0IHRoZSBkZWZhdWx0Jyxcblx0XHRcdFx0XHRgJCh6YXApIG5hbWVcXG4tIHBhdGg6IHBhdGhcXG4tIGFyZ3M6IFsnYScsJ2InXVxcbi0gb3ZlcnJpZGVOYW1lOiB0cnVlXFxuLSBjb2xvcjogdGVybWluYWwuYW5zaVJlZFxcbi0gZW52OiB7XFxcImNcXFwiOlxcXCJkXFxcIixcXFwiZVxcXCI6XFxcImZcXFwifWBcblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiBhIG11bHRpcGxlIGVudHJpZXMgd2hlbiB0aGVyZSBhcmUgbXVsdGlwbGUgcHJvZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9maWxlMTogSVRlcm1pbmFsUHJvZmlsZSA9IHtcblx0XHRcdFx0cHJvZmlsZU5hbWU6ICduYW1lJyxcblx0XHRcdFx0cGF0aDogJ3BhdGgnLFxuXHRcdFx0XHRpc0RlZmF1bHQ6IHRydWVcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm9maWxlMjogSVRlcm1pbmFsUHJvZmlsZSA9IHtcblx0XHRcdFx0cHJvZmlsZU5hbWU6ICdmb28nLFxuXHRcdFx0XHRwYXRoOiAnYmFyJyxcblx0XHRcdFx0aXNEZWZhdWx0OiBmYWxzZVxuXHRcdFx0fTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChjcmVhdGVQcm9maWxlU2NoZW1hRW51bXMoW3Byb2ZpbGUxLCBwcm9maWxlMl0pLCB7XG5cdFx0XHRcdHZhbHVlczogW1xuXHRcdFx0XHRcdG51bGwsXG5cdFx0XHRcdFx0J25hbWUnLFxuXHRcdFx0XHRcdCdmb28nXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0J0F1dG9tYXRpY2FsbHkgZGV0ZWN0IHRoZSBkZWZhdWx0Jyxcblx0XHRcdFx0XHQnJCh0ZXJtaW5hbCkgbmFtZVxcbi0gcGF0aDogcGF0aCcsXG5cdFx0XHRcdFx0JyQodGVybWluYWwpIGZvb1xcbi0gcGF0aDogYmFyJ1xuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtDQUErQztBQUV4RCxTQUFTLGdDQUFnQztBQUV6QyxNQUFNLG9CQUFvQixNQUFNO0FBQy9CLDBDQUF3QztBQUV4QyxRQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLFNBQUssMkRBQTJELE1BQU07QUFDckUsc0JBQWdCLHlCQUF5QixDQUFDLENBQUMsR0FBRztBQUFBLFFBQzdDLFFBQVE7QUFBQSxVQUNQO0FBQUEsUUFDRDtBQUFBLFFBQ0Esc0JBQXNCO0FBQUEsVUFDckI7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsU0FBSywwREFBMEQsTUFBTTtBQUNwRSxZQUFNLFVBQTRCO0FBQUEsUUFDakMsYUFBYTtBQUFBLFFBQ2IsTUFBTTtBQUFBLFFBQ04sV0FBVztBQUFBLE1BQ1o7QUFDQSxzQkFBZ0IseUJBQXlCLENBQUMsT0FBTyxDQUFDLEdBQUc7QUFBQSxRQUNwRCxRQUFRO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQSxzQkFBc0I7QUFBQSxVQUNyQjtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxZQUFNLFVBQTRCO0FBQUEsUUFDakMsYUFBYTtBQUFBLFFBQ2IsTUFBTTtBQUFBLFFBQ04sV0FBVztBQUFBLFFBQ1gsTUFBTSxDQUFDLEtBQUssR0FBRztBQUFBLFFBQ2YsT0FBTztBQUFBLFFBQ1AsS0FBSztBQUFBLFVBQ0osR0FBRztBQUFBLFVBQ0gsR0FBRztBQUFBLFFBQ0o7QUFBQSxRQUNBLE1BQU0sUUFBUTtBQUFBLFFBQ2QsY0FBYztBQUFBLE1BQ2Y7QUFDQSxzQkFBZ0IseUJBQXlCLENBQUMsT0FBTyxDQUFDLEdBQUc7QUFBQSxRQUNwRCxRQUFRO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQSxzQkFBc0I7QUFBQSxVQUNyQjtBQUFBLFVBQ0E7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFNBQUsscUVBQXFFLE1BQU07QUFDL0UsWUFBTSxXQUE2QjtBQUFBLFFBQ2xDLGFBQWE7QUFBQSxRQUNiLE1BQU07QUFBQSxRQUNOLFdBQVc7QUFBQSxNQUNaO0FBQ0EsWUFBTSxXQUE2QjtBQUFBLFFBQ2xDLGFBQWE7QUFBQSxRQUNiLE1BQU07QUFBQSxRQUNOLFdBQVc7QUFBQSxNQUNaO0FBQ0Esc0JBQWdCLHlCQUF5QixDQUFDLFVBQVUsUUFBUSxDQUFDLEdBQUc7QUFBQSxRQUMvRCxRQUFRO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0Esc0JBQXNCO0FBQUEsVUFDckI7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
