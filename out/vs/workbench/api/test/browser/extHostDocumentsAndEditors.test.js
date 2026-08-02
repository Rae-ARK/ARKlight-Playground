import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostDocumentsAndEditors", () => {
  let editors;
  setup(function() {
    editors = new ExtHostDocumentsAndEditors(new TestRPCProtocol(), new NullLogService());
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("The value of TextDocument.isClosed is incorrect when a text document is closed, #27949", () => {
    editors.$acceptDocumentsAndEditorsDelta({
      addedDocuments: [{
        EOL: "\n",
        isDirty: true,
        languageId: "fooLang",
        uri: URI.parse("foo:bar"),
        versionId: 1,
        lines: [
          "first",
          "second"
        ],
        encoding: "utf8"
      }]
    });
    return new Promise((resolve, reject) => {
      const d = editors.onDidRemoveDocuments((e) => {
        try {
          for (const data of e) {
            assert.strictEqual(data.document.isClosed, true);
          }
          resolve(void 0);
        } catch (e2) {
          reject(e2);
        } finally {
          d.dispose();
        }
      });
      editors.$acceptDocumentsAndEditorsDelta({
        removedDocuments: [URI.parse("foo:bar")]
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuaW1wb3J0IHsgVGVzdFJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMnLCAoKSA9PiB7XG5cblx0bGV0IGVkaXRvcnM6IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRlZGl0b3JzID0gbmV3IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdUaGUgdmFsdWUgb2YgVGV4dERvY3VtZW50LmlzQ2xvc2VkIGlzIGluY29ycmVjdCB3aGVuIGEgdGV4dCBkb2N1bWVudCBpcyBjbG9zZWQsICMyNzk0OScsICgpID0+IHtcblxuXHRcdGVkaXRvcnMuJGFjY2VwdERvY3VtZW50c0FuZEVkaXRvcnNEZWx0YSh7XG5cdFx0XHRhZGRlZERvY3VtZW50czogW3tcblx0XHRcdFx0RU9MOiAnXFxuJyxcblx0XHRcdFx0aXNEaXJ0eTogdHJ1ZSxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ2Zvb0xhbmcnLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZm9vOmJhcicpLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IDEsXG5cdFx0XHRcdGxpbmVzOiBbXG5cdFx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0XHQnc2Vjb25kJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRlbmNvZGluZzogJ3V0ZjgnXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblxuXHRcdFx0Y29uc3QgZCA9IGVkaXRvcnMub25EaWRSZW1vdmVEb2N1bWVudHMoZSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgZSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuZG9jdW1lbnQuaXNDbG9zZWQsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRyZWplY3QoZSk7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0ZC5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRlZGl0b3JzLiRhY2NlcHREb2N1bWVudHNBbmRFZGl0b3JzRGVsdGEoe1xuXHRcdFx0XHRyZW1vdmVkRG9jdW1lbnRzOiBbVVJJLnBhcnNlKCdmb286YmFyJyldXG5cdFx0XHR9KTtcblxuXHRcdH0pO1xuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sOEJBQThCLE1BQU07QUFFekMsTUFBSTtBQUVKLFFBQU0sV0FBWTtBQUNqQixjQUFVLElBQUksMkJBQTJCLElBQUksZ0JBQWdCLEdBQUcsSUFBSSxlQUFlLENBQUM7QUFBQSxFQUNyRixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLE9BQUssMEZBQTBGLE1BQU07QUFFcEcsWUFBUSxnQ0FBZ0M7QUFBQSxNQUN2QyxnQkFBZ0IsQ0FBQztBQUFBLFFBQ2hCLEtBQUs7QUFBQSxRQUNMLFNBQVM7QUFBQSxRQUNULFlBQVk7QUFBQSxRQUNaLEtBQUssSUFBSSxNQUFNLFNBQVM7QUFBQSxRQUN4QixXQUFXO0FBQUEsUUFDWCxPQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQSxVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFFdkMsWUFBTSxJQUFJLFFBQVEscUJBQXFCLE9BQUs7QUFDM0MsWUFBSTtBQUVILHFCQUFXLFFBQVEsR0FBRztBQUNyQixtQkFBTyxZQUFZLEtBQUssU0FBUyxVQUFVLElBQUk7QUFBQSxVQUNoRDtBQUNBLGtCQUFRLE1BQVM7QUFBQSxRQUNsQixTQUFTQSxJQUFHO0FBQ1gsaUJBQU9BLEVBQUM7QUFBQSxRQUNULFVBQUU7QUFDRCxZQUFFLFFBQVE7QUFBQSxRQUNYO0FBQUEsTUFDRCxDQUFDO0FBRUQsY0FBUSxnQ0FBZ0M7QUFBQSxRQUN2QyxrQkFBa0IsQ0FBQyxJQUFJLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDeEMsQ0FBQztBQUFBLElBRUYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVGLENBQUM7IiwKICAibmFtZXMiOiBbImUiXQp9Cg==
