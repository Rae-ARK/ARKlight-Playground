import assert from "assert";
import { mockFiles, MockFilesystem } from "./mockFilesystem.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { assertDefined } from "../../../../../../../base/common/types.js";
import { FileService } from "../../../../../../../platform/files/common/fileService.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { InMemoryFileSystemProvider } from "../../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
async function validateFile(filePath, expectedFile, fileService) {
  let readFile;
  try {
    readFile = await fileService.resolve(URI.file(filePath));
  } catch (error) {
    throw new Error(`Failed to read file '${filePath}': ${error}.`);
  }
  assert.strictEqual(
    readFile.name,
    expectedFile.name,
    `File '${filePath}' must have correct 'name'.`
  );
  assert.deepStrictEqual(
    readFile.resource,
    expectedFile.resource,
    `File '${filePath}' must have correct 'URI'.`
  );
  assert.strictEqual(
    readFile.isFile,
    expectedFile.isFile,
    `File '${filePath}' must have correct 'isFile' value.`
  );
  assert.strictEqual(
    readFile.isDirectory,
    expectedFile.isDirectory,
    `File '${filePath}' must have correct 'isDirectory' value.`
  );
  assert.strictEqual(
    readFile.isSymbolicLink,
    expectedFile.isSymbolicLink,
    `File '${filePath}' must have correct 'isSymbolicLink' value.`
  );
  assert.strictEqual(
    readFile.children,
    void 0,
    `File '${filePath}' must not have children.`
  );
  const fileContents = await fileService.readFile(readFile.resource);
  assert.strictEqual(
    fileContents.value.toString(),
    expectedFile.contents,
    `File '${expectedFile.resource.fsPath}' must have correct contents.`
  );
}
async function validateFolder(folderPath, expectedFolder, fileService) {
  let readFolder;
  try {
    readFolder = await fileService.resolve(URI.file(folderPath));
  } catch (error) {
    throw new Error(`Failed to read folder '${folderPath}': ${error}.`);
  }
  assert.strictEqual(
    readFolder.name,
    expectedFolder.name,
    `Folder '${folderPath}' must have correct 'name'.`
  );
  assert.deepStrictEqual(
    readFolder.resource,
    expectedFolder.resource,
    `Folder '${folderPath}' must have correct 'URI'.`
  );
  assert.strictEqual(
    readFolder.isFile,
    expectedFolder.isFile,
    `Folder '${folderPath}' must have correct 'isFile' value.`
  );
  assert.strictEqual(
    readFolder.isDirectory,
    expectedFolder.isDirectory,
    `Folder '${folderPath}' must have correct 'isDirectory' value.`
  );
  assert.strictEqual(
    readFolder.isSymbolicLink,
    expectedFolder.isSymbolicLink,
    `Folder '${folderPath}' must have correct 'isSymbolicLink' value.`
  );
  assertDefined(
    readFolder.children,
    `Folder '${folderPath}' must have children.`
  );
  assert.strictEqual(
    readFolder.children.length,
    expectedFolder.children.length,
    `Folder '${folderPath}' must have correct number of children.`
  );
  for (const expectedChild of expectedFolder.children) {
    const childPath = URI.joinPath(expectedFolder.resource, expectedChild.name).fsPath;
    if ("children" in expectedChild) {
      await validateFolder(
        childPath,
        expectedChild,
        fileService
      );
      continue;
    }
    await validateFile(
      childPath,
      expectedChild,
      fileService
    );
  }
}
suite("MockFilesystem", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let fileService;
  setup(async () => {
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(ILogService, new NullLogService());
    fileService = disposables.add(instantiationService.createInstance(FileService));
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.file, fileSystemProvider));
    instantiationService.stub(IFileService, fileService);
  });
  test("mocks file structure using new simplified format", async () => {
    const mockFilesystem = instantiationService.createInstance(MockFilesystem, [
      {
        path: "/root/folder/file.txt",
        contents: ["contents"]
      },
      {
        path: "/root/folder/Subfolder/test.ts",
        contents: ["other contents"]
      },
      {
        path: "/root/folder/Subfolder/file.test.ts",
        contents: ["hello test"]
      },
      {
        path: "/root/folder/Subfolder/.file-2.TEST.ts",
        contents: ["test hello"]
      }
    ]);
    await mockFilesystem.mock();
    await validateFolder(
      "/root/folder",
      {
        resource: URI.file("/root/folder"),
        name: "folder",
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        children: [
          {
            resource: URI.file("/root/folder/file.txt"),
            name: "file.txt",
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
            contents: "contents"
          },
          {
            resource: URI.file("/root/folder/Subfolder"),
            name: "Subfolder",
            isFile: false,
            isDirectory: true,
            isSymbolicLink: false,
            children: [
              {
                resource: URI.file("/root/folder/Subfolder/test.ts"),
                name: "test.ts",
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                contents: "other contents"
              },
              {
                resource: URI.file("/root/folder/Subfolder/file.test.ts"),
                name: "file.test.ts",
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                contents: "hello test"
              },
              {
                resource: URI.file("/root/folder/Subfolder/.file-2.TEST.ts"),
                name: ".file-2.TEST.ts",
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                contents: "test hello"
              }
            ]
          }
        ]
      },
      fileService
    );
  });
  test("can be created using static factory method", async () => {
    await mockFiles(fileService, [
      {
        path: "/simple/test.txt",
        contents: ["line 1", "line 2", "line 3"]
      }
    ]);
    await validateFile(
      "/simple/test.txt",
      {
        resource: URI.file("/simple/test.txt"),
        name: "test.txt",
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
        contents: "line 1\nline 2\nline 3"
      },
      fileService
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L3Rlc3RVdGlscy9tb2NrRmlsZXN5c3RlbS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbW9ja0ZpbGVzLCBNb2NrRmlsZXN5c3RlbSB9IGZyb20gJy4vbW9ja0ZpbGVzeXN0ZW0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGFzc2VydERlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcblxuLyoqXG4gKiBCYXNlIGF0dHJpYnV0ZSBmb3IgYW4gZXhwZWN0ZWQgZmlsZXN5c3RlbSBub2RlIChhIGZpbGUgb3IgYSBmb2xkZXIpLlxuICovXG5pbnRlcmZhY2UgSUV4cGVjdGVkRmlsZXN5c3RlbU5vZGUgZXh0ZW5kcyBQaWNrPFxuXHRJRmlsZVN0YXQsXG5cdCdyZXNvdXJjZScgfCAnbmFtZScgfCAnaXNGaWxlJyB8ICdpc0RpcmVjdG9yeScgfCAnaXNTeW1ib2xpY0xpbmsnXG4+IHsgfVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gZXhwZWN0ZWQgYGZpbGVgIGluZm8uXG4gKi9cbmludGVyZmFjZSBJRXhwZWN0ZWRGaWxlIGV4dGVuZHMgSUV4cGVjdGVkRmlsZXN5c3RlbU5vZGUge1xuXHQvKipcblx0ICogRXhwZWN0ZWQgZmlsZSBjb250ZW50cy5cblx0ICovXG5cdGNvbnRlbnRzOiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBleHBlY3RlZCBgZm9sZGVyYCBpbmZvLlxuICovXG5pbnRlcmZhY2UgSUV4cGVjdGVkRm9sZGVyIGV4dGVuZHMgSUV4cGVjdGVkRmlsZXN5c3RlbU5vZGUge1xuXHQvKipcblx0ICogRXhwZWN0ZWQgZm9sZGVyIGNoaWxkcmVuLlxuXHQgKi9cblx0Y2hpbGRyZW46IChJRXhwZWN0ZWRGb2xkZXIgfCBJRXhwZWN0ZWRGaWxlKVtdO1xufVxuXG4vKipcbiAqIFZhbGlkYXRlcyB0aGF0IGZpbGUgYXQge0BsaW5rIGZpbGVQYXRofSBoYXMgZXhwZWN0ZWQgYXR0cmlidXRlcy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gdmFsaWRhdGVGaWxlKFxuXHRmaWxlUGF0aDogc3RyaW5nLFxuXHRleHBlY3RlZEZpbGU6IElFeHBlY3RlZEZpbGUsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG4pIHtcblx0bGV0IHJlYWRGaWxlOiBJRmlsZVN0YXQgfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0cmVhZEZpbGUgPSBhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGZpbGVQYXRoKSk7XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gcmVhZCBmaWxlICcke2ZpbGVQYXRofSc6ICR7ZXJyb3J9LmApO1xuXHR9XG5cblx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdHJlYWRGaWxlLm5hbWUsXG5cdFx0ZXhwZWN0ZWRGaWxlLm5hbWUsXG5cdFx0YEZpbGUgJyR7ZmlsZVBhdGh9JyBtdXN0IGhhdmUgY29ycmVjdCAnbmFtZScuYCxcblx0KTtcblxuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdHJlYWRGaWxlLnJlc291cmNlLFxuXHRcdGV4cGVjdGVkRmlsZS5yZXNvdXJjZSxcblx0XHRgRmlsZSAnJHtmaWxlUGF0aH0nIG11c3QgaGF2ZSBjb3JyZWN0ICdVUkknLmAsXG5cdCk7XG5cblx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdHJlYWRGaWxlLmlzRmlsZSxcblx0XHRleHBlY3RlZEZpbGUuaXNGaWxlLFxuXHRcdGBGaWxlICcke2ZpbGVQYXRofScgbXVzdCBoYXZlIGNvcnJlY3QgJ2lzRmlsZScgdmFsdWUuYCxcblx0KTtcblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZpbGUuaXNEaXJlY3RvcnksXG5cdFx0ZXhwZWN0ZWRGaWxlLmlzRGlyZWN0b3J5LFxuXHRcdGBGaWxlICcke2ZpbGVQYXRofScgbXVzdCBoYXZlIGNvcnJlY3QgJ2lzRGlyZWN0b3J5JyB2YWx1ZS5gLFxuXHQpO1xuXG5cdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRyZWFkRmlsZS5pc1N5bWJvbGljTGluayxcblx0XHRleHBlY3RlZEZpbGUuaXNTeW1ib2xpY0xpbmssXG5cdFx0YEZpbGUgJyR7ZmlsZVBhdGh9JyBtdXN0IGhhdmUgY29ycmVjdCAnaXNTeW1ib2xpY0xpbmsnIHZhbHVlLmAsXG5cdCk7XG5cblx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdHJlYWRGaWxlLmNoaWxkcmVuLFxuXHRcdHVuZGVmaW5lZCxcblx0XHRgRmlsZSAnJHtmaWxlUGF0aH0nIG11c3Qgbm90IGhhdmUgY2hpbGRyZW4uYCxcblx0KTtcblxuXHRjb25zdCBmaWxlQ29udGVudHMgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShyZWFkRmlsZS5yZXNvdXJjZSk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRmaWxlQ29udGVudHMudmFsdWUudG9TdHJpbmcoKSxcblx0XHRleHBlY3RlZEZpbGUuY29udGVudHMsXG5cdFx0YEZpbGUgJyR7ZXhwZWN0ZWRGaWxlLnJlc291cmNlLmZzUGF0aH0nIG11c3QgaGF2ZSBjb3JyZWN0IGNvbnRlbnRzLmAsXG5cdCk7XG59XG5cbi8qKlxuICogVmFsaWRhdGVzIHRoYXQgZm9sZGVyIGF0IHtAbGluayBmb2xkZXJQYXRofSBoYXMgZXhwZWN0ZWQgYXR0cmlidXRlcy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gdmFsaWRhdGVGb2xkZXIoXG5cdGZvbGRlclBhdGg6IHN0cmluZyxcblx0ZXhwZWN0ZWRGb2xkZXI6IElFeHBlY3RlZEZvbGRlcixcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRsZXQgcmVhZEZvbGRlcjogSUZpbGVTdGF0IHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdHJlYWRGb2xkZXIgPSBhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKFVSSS5maWxlKGZvbGRlclBhdGgpKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byByZWFkIGZvbGRlciAnJHtmb2xkZXJQYXRofSc6ICR7ZXJyb3J9LmApO1xuXHR9XG5cblx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdHJlYWRGb2xkZXIubmFtZSxcblx0XHRleHBlY3RlZEZvbGRlci5uYW1lLFxuXHRcdGBGb2xkZXIgJyR7Zm9sZGVyUGF0aH0nIG11c3QgaGF2ZSBjb3JyZWN0ICduYW1lJy5gLFxuXHQpO1xuXG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZvbGRlci5yZXNvdXJjZSxcblx0XHRleHBlY3RlZEZvbGRlci5yZXNvdXJjZSxcblx0XHRgRm9sZGVyICcke2ZvbGRlclBhdGh9JyBtdXN0IGhhdmUgY29ycmVjdCAnVVJJJy5gLFxuXHQpO1xuXG5cdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRyZWFkRm9sZGVyLmlzRmlsZSxcblx0XHRleHBlY3RlZEZvbGRlci5pc0ZpbGUsXG5cdFx0YEZvbGRlciAnJHtmb2xkZXJQYXRofScgbXVzdCBoYXZlIGNvcnJlY3QgJ2lzRmlsZScgdmFsdWUuYCxcblx0KTtcblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZvbGRlci5pc0RpcmVjdG9yeSxcblx0XHRleHBlY3RlZEZvbGRlci5pc0RpcmVjdG9yeSxcblx0XHRgRm9sZGVyICcke2ZvbGRlclBhdGh9JyBtdXN0IGhhdmUgY29ycmVjdCAnaXNEaXJlY3RvcnknIHZhbHVlLmAsXG5cdCk7XG5cblx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdHJlYWRGb2xkZXIuaXNTeW1ib2xpY0xpbmssXG5cdFx0ZXhwZWN0ZWRGb2xkZXIuaXNTeW1ib2xpY0xpbmssXG5cdFx0YEZvbGRlciAnJHtmb2xkZXJQYXRofScgbXVzdCBoYXZlIGNvcnJlY3QgJ2lzU3ltYm9saWNMaW5rJyB2YWx1ZS5gLFxuXHQpO1xuXG5cdGFzc2VydERlZmluZWQoXG5cdFx0cmVhZEZvbGRlci5jaGlsZHJlbixcblx0XHRgRm9sZGVyICcke2ZvbGRlclBhdGh9JyBtdXN0IGhhdmUgY2hpbGRyZW4uYCxcblx0KTtcblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0cmVhZEZvbGRlci5jaGlsZHJlbi5sZW5ndGgsXG5cdFx0ZXhwZWN0ZWRGb2xkZXIuY2hpbGRyZW4ubGVuZ3RoLFxuXHRcdGBGb2xkZXIgJyR7Zm9sZGVyUGF0aH0nIG11c3QgaGF2ZSBjb3JyZWN0IG51bWJlciBvZiBjaGlsZHJlbi5gLFxuXHQpO1xuXG5cdGZvciAoY29uc3QgZXhwZWN0ZWRDaGlsZCBvZiBleHBlY3RlZEZvbGRlci5jaGlsZHJlbikge1xuXHRcdGNvbnN0IGNoaWxkUGF0aCA9IFVSSS5qb2luUGF0aChleHBlY3RlZEZvbGRlci5yZXNvdXJjZSwgZXhwZWN0ZWRDaGlsZC5uYW1lKS5mc1BhdGg7XG5cblx0XHRpZiAoJ2NoaWxkcmVuJyBpbiBleHBlY3RlZENoaWxkKSB7XG5cdFx0XHRhd2FpdCB2YWxpZGF0ZUZvbGRlcihcblx0XHRcdFx0Y2hpbGRQYXRoLFxuXHRcdFx0XHRleHBlY3RlZENoaWxkLFxuXHRcdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGF3YWl0IHZhbGlkYXRlRmlsZShcblx0XHRcdGNoaWxkUGF0aCxcblx0XHRcdGV4cGVjdGVkQ2hpbGQsXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHQpO1xuXHR9XG59XG5cbnN1aXRlKCdNb2NrRmlsZXN5c3RlbScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVzdCgnbW9ja3MgZmlsZSBzdHJ1Y3R1cmUgdXNpbmcgbmV3IHNpbXBsaWZpZWQgZm9ybWF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vY2tGaWxlc3lzdGVtID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9ja0ZpbGVzeXN0ZW0sIFtcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9yb290L2ZvbGRlci9maWxlLnR4dCcsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ2NvbnRlbnRzJ11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvcm9vdC9mb2xkZXIvU3ViZm9sZGVyL3Rlc3QudHMnLFxuXHRcdFx0XHRjb250ZW50czogWydvdGhlciBjb250ZW50cyddXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRwYXRoOiAnL3Jvb3QvZm9sZGVyL1N1YmZvbGRlci9maWxlLnRlc3QudHMnLFxuXHRcdFx0XHRjb250ZW50czogWydoZWxsbyB0ZXN0J11cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhdGg6ICcvcm9vdC9mb2xkZXIvU3ViZm9sZGVyLy5maWxlLTIuVEVTVC50cycsXG5cdFx0XHRcdGNvbnRlbnRzOiBbJ3Rlc3QgaGVsbG8nXVxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgbW9ja0ZpbGVzeXN0ZW0ubW9jaygpO1xuXG5cdFx0LyoqXG5cdFx0ICogVmFsaWRhdGUgZmlsZXMgYW5kIGZvbGRlcnMgbmV4dC5cblx0XHQgKi9cblxuXHRcdGF3YWl0IHZhbGlkYXRlRm9sZGVyKFxuXHRcdFx0Jy9yb290L2ZvbGRlcicsXG5cdFx0XHR7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkuZmlsZSgnL3Jvb3QvZm9sZGVyJyksXG5cdFx0XHRcdG5hbWU6ICdmb2xkZXInLFxuXHRcdFx0XHRpc0ZpbGU6IGZhbHNlLFxuXHRcdFx0XHRpc0RpcmVjdG9yeTogdHJ1ZSxcblx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkuZmlsZSgnL3Jvb3QvZm9sZGVyL2ZpbGUudHh0JyksXG5cdFx0XHRcdFx0XHRuYW1lOiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdFx0aXNGaWxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IGZhbHNlLFxuXHRcdFx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6ICdjb250ZW50cycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLmZpbGUoJy9yb290L2ZvbGRlci9TdWJmb2xkZXInKSxcblx0XHRcdFx0XHRcdG5hbWU6ICdTdWJmb2xkZXInLFxuXHRcdFx0XHRcdFx0aXNGaWxlOiBmYWxzZSxcblx0XHRcdFx0XHRcdGlzRGlyZWN0b3J5OiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiBVUkkuZmlsZSgnL3Jvb3QvZm9sZGVyL1N1YmZvbGRlci90ZXN0LnRzJyksXG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ3Rlc3QudHMnLFxuXHRcdFx0XHRcdFx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRpc0RpcmVjdG9yeTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiAnb3RoZXIgY29udGVudHMnLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb3VyY2U6IFVSSS5maWxlKCcvcm9vdC9mb2xkZXIvU3ViZm9sZGVyL2ZpbGUudGVzdC50cycpLFxuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdmaWxlLnRlc3QudHMnLFxuXHRcdFx0XHRcdFx0XHRcdGlzRmlsZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRpc0RpcmVjdG9yeTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRzOiAnaGVsbG8gdGVzdCcsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogVVJJLmZpbGUoJy9yb290L2ZvbGRlci9TdWJmb2xkZXIvLmZpbGUtMi5URVNULnRzJyksXG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJy5maWxlLTIuVEVTVC50cycsXG5cdFx0XHRcdFx0XHRcdFx0aXNGaWxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRpc1N5bWJvbGljTGluazogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudHM6ICd0ZXN0IGhlbGxvJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBiZSBjcmVhdGVkIHVzaW5nIHN0YXRpYyBmYWN0b3J5IG1ldGhvZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdHtcblx0XHRcdFx0cGF0aDogJy9zaW1wbGUvdGVzdC50eHQnLFxuXHRcdFx0XHRjb250ZW50czogWydsaW5lIDEnLCAnbGluZSAyJywgJ2xpbmUgMyddXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHRhd2FpdCB2YWxpZGF0ZUZpbGUoXG5cdFx0XHQnL3NpbXBsZS90ZXN0LnR4dCcsXG5cdFx0XHR7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkuZmlsZSgnL3NpbXBsZS90ZXN0LnR4dCcpLFxuXHRcdFx0XHRuYW1lOiAndGVzdC50eHQnLFxuXHRcdFx0XHRpc0ZpbGU6IHRydWUsXG5cdFx0XHRcdGlzRGlyZWN0b3J5OiBmYWxzZSxcblx0XHRcdFx0aXNTeW1ib2xpY0xpbms6IGZhbHNlLFxuXHRcdFx0XHRjb250ZW50czogJ2xpbmUgMVxcbmxpbmUgMlxcbmxpbmUgMycsXG5cdFx0XHR9LFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVcsc0JBQXNCO0FBQzFDLFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLG9CQUErQjtBQUN4QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGdDQUFnQztBQWlDekMsZUFBZSxhQUNkLFVBQ0EsY0FDQSxhQUNDO0FBQ0QsTUFBSTtBQUNKLE1BQUk7QUFDSCxlQUFXLE1BQU0sWUFBWSxRQUFRLElBQUksS0FBSyxRQUFRLENBQUM7QUFBQSxFQUN4RCxTQUFTLE9BQU87QUFDZixVQUFNLElBQUksTUFBTSx3QkFBd0IsUUFBUSxNQUFNLEtBQUssR0FBRztBQUFBLEVBQy9EO0FBRUEsU0FBTztBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsU0FBUyxRQUFRO0FBQUEsRUFDbEI7QUFFQSxTQUFPO0FBQUEsSUFDTixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixTQUFTLFFBQVE7QUFBQSxFQUNsQjtBQUVBLFNBQU87QUFBQSxJQUNOLFNBQVM7QUFBQSxJQUNULGFBQWE7QUFBQSxJQUNiLFNBQVMsUUFBUTtBQUFBLEVBQ2xCO0FBRUEsU0FBTztBQUFBLElBQ04sU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsU0FBUyxRQUFRO0FBQUEsRUFDbEI7QUFFQSxTQUFPO0FBQUEsSUFDTixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixTQUFTLFFBQVE7QUFBQSxFQUNsQjtB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
