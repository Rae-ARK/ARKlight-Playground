import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestDialogService } from "../../../dialogs/test/common/testDialogService.js";
import { TestNotificationService } from "../../../notification/test/common/testNotificationService.js";
import { UndoRedoElementType, UndoRedoGroup } from "../../common/undoRedo.js";
import { UndoRedoService } from "../../common/undoRedoService.js";
suite("UndoRedoService", () => {
  function createUndoRedoService(dialogService = new TestDialogService()) {
    const notificationService = new TestNotificationService();
    return new UndoRedoService(dialogService, notificationService);
  }
  test("simple single resource elements", () => {
    const resource = URI.file("test.txt");
    const service = createUndoRedoService();
    assert.strictEqual(service.canUndo(resource), false);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), false);
    assert.ok(service.getLastElement(resource) === null);
    let undoCall1 = 0;
    let redoCall1 = 0;
    const element1 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 1",
      code: "typing",
      undo: () => {
        undoCall1++;
      },
      redo: () => {
        redoCall1++;
      }
    };
    service.pushElement(element1);
    assert.strictEqual(undoCall1, 0);
    assert.strictEqual(redoCall1, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === element1);
    service.undo(resource);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 0);
    assert.strictEqual(service.canUndo(resource), false);
    assert.strictEqual(service.canRedo(resource), true);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === null);
    service.redo(resource);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === element1);
    let undoCall2 = 0;
    let redoCall2 = 0;
    const element2 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 2",
      code: "typing",
      undo: () => {
        undoCall2++;
      },
      redo: () => {
        redoCall2++;
      }
    };
    service.pushElement(element2);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall2, 0);
    assert.strictEqual(redoCall2, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === element2);
    service.undo(resource);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall2, 1);
    assert.strictEqual(redoCall2, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), true);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === null);
    let undoCall3 = 0;
    let redoCall3 = 0;
    const element3 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 2",
      code: "typing",
      undo: () => {
        undoCall3++;
      },
      redo: () => {
        redoCall3++;
      }
    };
    service.pushElement(element3);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall2, 1);
    assert.strictEqual(redoCall2, 0);
    assert.strictEqual(undoCall3, 0);
    assert.strictEqual(redoCall3, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), false);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === element3);
    service.undo(resource);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall2, 1);
    assert.strictEqual(redoCall2, 0);
    assert.strictEqual(undoCall3, 1);
    assert.strictEqual(redoCall3, 0);
    assert.strictEqual(service.canUndo(resource), true);
    assert.strictEqual(service.canRedo(resource), true);
    assert.strictEqual(service.hasElements(resource), true);
    assert.ok(service.getLastElement(resource) === null);
  });
  test("multi resource elements", async () => {
    const resource1 = URI.file("test1.txt");
    const resource2 = URI.file("test2.txt");
    const service = createUndoRedoService(new class extends mock() {
      async prompt(prompt) {
        const result = prompt.buttons?.[0].run({ checkboxChecked: false });
        return { result };
      }
      async confirm() {
        return {
          confirmed: true
          // confirm!
        };
      }
    }());
    let undoCall1 = 0, undoCall11 = 0, undoCall12 = 0;
    let redoCall1 = 0, redoCall11 = 0, redoCall12 = 0;
    const element1 = {
      type: UndoRedoElementType.Workspace,
      resources: [resource1, resource2],
      label: "typing 1",
      code: "typing",
      undo: () => {
        undoCall1++;
      },
      redo: () => {
        redoCall1++;
      },
      split: () => {
        return [
          {
            type: UndoRedoElementType.Resource,
            resource: resource1,
            label: "typing 1.1",
            code: "typing",
            undo: () => {
              undoCall11++;
            },
            redo: () => {
              redoCall11++;
            }
          },
          {
            type: UndoRedoElementType.Resource,
            resource: resource2,
            label: "typing 1.2",
            code: "typing",
            undo: () => {
              undoCall12++;
            },
            redo: () => {
              redoCall12++;
            }
          }
        ];
      }
    };
    service.pushElement(element1);
    assert.strictEqual(service.canUndo(resource1), true);
    assert.strictEqual(service.canRedo(resource1), false);
    assert.strictEqual(service.hasElements(resource1), true);
    assert.ok(service.getLastElement(resource1) === element1);
    assert.strictEqual(service.canUndo(resource2), true);
    assert.strictEqual(service.canRedo(resource2), false);
    assert.strictEqual(service.hasElements(resource2), true);
    assert.ok(service.getLastElement(resource2) === element1);
    await service.undo(resource1);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 0);
    assert.strictEqual(service.canUndo(resource1), false);
    assert.strictEqual(service.canRedo(resource1), true);
    assert.strictEqual(service.hasElements(resource1), true);
    assert.ok(service.getLastElement(resource1) === null);
    assert.strictEqual(service.canUndo(resource2), false);
    assert.strictEqual(service.canRedo(resource2), true);
    assert.strictEqual(service.hasElements(resource2), true);
    assert.ok(service.getLastElement(resource2) === null);
    await service.redo(resource2);
    assert.strictEqual(undoCall1, 1);
    assert.strictEqual(redoCall1, 1);
    assert.strictEqual(undoCall11, 0);
    assert.strictEqual(redoCall11, 0);
    assert.strictEqual(undoCall12, 0);
    assert.strictEqual(redoCall12, 0);
    assert.strictEqual(service.canUndo(resource1), true);
    assert.strictEqual(service.canRedo(resource1), false);
    assert.strictEqual(service.hasElements(resource1), true);
    assert.ok(service.getLastElement(resource1) === element1);
    assert.strictEqual(service.canUndo(resource2), true);
    assert.strictEqual(service.canRedo(resource2), false);
    assert.strictEqual(service.hasElements(resource2), true);
    assert.ok(service.getLastElement(resource2) === element1);
  });
  test("UndoRedoGroup.None uses id 0", () => {
    assert.strictEqual(UndoRedoGroup.None.id, 0);
    assert.strictEqual(UndoRedoGroup.None.nextOrder(), 0);
    assert.strictEqual(UndoRedoGroup.None.nextOrder(), 0);
  });
  test("restoreSnapshot preserves elements that match the snapshot", () => {
    const resource = URI.file("test.txt");
    const service = createUndoRedoService();
    const element1 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 1",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    const element2 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 2",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    const element3 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 3",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    service.pushElement(element1);
    service.pushElement(element2);
    service.pushElement(element3);
    const snapshot = service.createSnapshot(resource);
    const element4 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 4",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    const element5 = {
      type: UndoRedoElementType.Resource,
      resource,
      label: "typing 5",
      code: "typing",
      undo: () => {
      },
      redo: () => {
      }
    };
    service.pushElement(element4);
    service.pushElement(element5);
    let elements = service.getElements(resource);
    assert.strictEqual(elements.past.length, 5);
    assert.strictEqual(elements.future.length, 0);
    service.restoreSnapshot(snapshot);
    elements = service.getElements(resource);
    assert.strictEqual(elements.past.length, 3, "Should have 3 past elements after restore");
    assert.strictEqual(elements.future.length, 0, "Should have 0 future elements after restore");
    assert.strictEqual(elements.past[0], element1, "First element should be element1");
    assert.strictEqual(elements.past[1], element2, "Second element should be element2");
    assert.strictEqual(elements.past[2], element3, "Third element should be element3");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VuZG9SZWRvL3Rlc3QvY29tbW9uL3VuZG9SZWRvU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSVByb21wdCB9IGZyb20gJy4uLy4uLy4uL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgVGVzdERpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9kaWFsb2dzL3Rlc3QvY29tbW9uL3Rlc3REaWFsb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb0VsZW1lbnQsIFVuZG9SZWRvRWxlbWVudFR5cGUsIFVuZG9SZWRvR3JvdXAgfSBmcm9tICcuLi8uLi9jb21tb24vdW5kb1JlZG8uanMnO1xuaW1wb3J0IHsgVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VuZG9SZWRvU2VydmljZS5qcyc7XG5cbnN1aXRlKCdVbmRvUmVkb1NlcnZpY2UnLCAoKSA9PiB7XG5cblx0ZnVuY3Rpb24gY3JlYXRlVW5kb1JlZG9TZXJ2aWNlKGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlID0gbmV3IFRlc3REaWFsb2dTZXJ2aWNlKCkpOiBVbmRvUmVkb1NlcnZpY2Uge1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRyZXR1cm4gbmV3IFVuZG9SZWRvU2VydmljZShkaWFsb2dTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlKTtcblx0fVxuXG5cdHRlc3QoJ3NpbXBsZSBzaW5nbGUgcmVzb3VyY2UgZWxlbWVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgndGVzdC50eHQnKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlVW5kb1JlZG9TZXJ2aWNlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzRWxlbWVudHMocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UpID09PSBudWxsKTtcblxuXHRcdGxldCB1bmRvQ2FsbDEgPSAwO1xuXHRcdGxldCByZWRvQ2FsbDEgPSAwO1xuXHRcdGNvbnN0IGVsZW1lbnQxOiBJVW5kb1JlZG9FbGVtZW50ID0ge1xuXHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSxcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAndHlwaW5nIDEnLFxuXHRcdFx0Y29kZTogJ3R5cGluZycsXG5cdFx0XHR1bmRvOiAoKSA9PiB7IHVuZG9DYWxsMSsrOyB9LFxuXHRcdFx0cmVkbzogKCkgPT4geyByZWRvQ2FsbDErKzsgfVxuXHRcdH07XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50MSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwxLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwxLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlKSA9PT0gZWxlbWVudDEpO1xuXG5cdFx0c2VydmljZS51bmRvKHJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwxLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlKSA9PT0gbnVsbCk7XG5cblx0XHRzZXJ2aWNlLnJlZG8ocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5SZWRvKHJlc291cmNlKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UpID09PSBlbGVtZW50MSk7XG5cblx0XHRsZXQgdW5kb0NhbGwyID0gMDtcblx0XHRsZXQgcmVkb0NhbGwyID0gMDtcblx0XHRjb25zdCBlbGVtZW50MjogSVVuZG9SZWRvRWxlbWVudCA9IHtcblx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2UsXG5cdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRsYWJlbDogJ3R5cGluZyAyJyxcblx0XHRcdGNvZGU6ICd0eXBpbmcnLFxuXHRcdFx0dW5kbzogKCkgPT4geyB1bmRvQ2FsbDIrKzsgfSxcblx0XHRcdHJlZG86ICgpID0+IHsgcmVkb0NhbGwyKys7IH1cblx0XHR9O1xuXHRcdHNlcnZpY2UucHVzaEVsZW1lbnQoZWxlbWVudDIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMiwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZG9DYWxsMiwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuVW5kbyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzRWxlbWVudHMocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZSkgPT09IGVsZW1lbnQyKTtcblxuXHRcdHNlcnZpY2UudW5kbyhyZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UpID09PSBudWxsKTtcblxuXHRcdGxldCB1bmRvQ2FsbDMgPSAwO1xuXHRcdGxldCByZWRvQ2FsbDMgPSAwO1xuXHRcdGNvbnN0IGVsZW1lbnQzOiBJVW5kb1JlZG9FbGVtZW50ID0ge1xuXHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSxcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAndHlwaW5nIDInLFxuXHRcdFx0Y29kZTogJ3R5cGluZycsXG5cdFx0XHR1bmRvOiAoKSA9PiB7IHVuZG9DYWxsMysrOyB9LFxuXHRcdFx0cmVkbzogKCkgPT4geyByZWRvQ2FsbDMrKzsgfVxuXHRcdH07XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50Myk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwyLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kb0NhbGwzLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwzLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZSksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlKSA9PT0gZWxlbWVudDMpO1xuXG5cdFx0c2VydmljZS51bmRvKHJlc291cmNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDMsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDMsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5SZWRvKHJlc291cmNlKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzRWxlbWVudHMocmVzb3VyY2UpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZSkgPT09IG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aSByZXNvdXJjZSBlbGVtZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZmlsZSgndGVzdDEudHh0Jyk7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLmZpbGUoJ3Rlc3QyLnR4dCcpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVVbmRvUmVkb1NlcnZpY2UobmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGlhbG9nU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBwcm9tcHQ8VCA9IGFueT4ocHJvbXB0OiBJUHJvbXB0PGFueT4pIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcHJvbXB0LmJ1dHRvbnM/LlswXS5ydW4oeyBjaGVja2JveENoZWNrZWQ6IGZhbHNlIH0pO1xuXG5cdFx0XHRcdHJldHVybiB7IHJlc3VsdCB9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY29uZmlybSgpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRjb25maXJtZWQ6IHRydWUgLy8gY29uZmlybSFcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCB1bmRvQ2FsbDEgPSAwLCB1bmRvQ2FsbDExID0gMCwgdW5kb0NhbGwxMiA9IDA7XG5cdFx0bGV0IHJlZG9DYWxsMSA9IDAsIHJlZG9DYWxsMTEgPSAwLCByZWRvQ2FsbDEyID0gMDtcblx0XHRjb25zdCBlbGVtZW50MTogSVVuZG9SZWRvRWxlbWVudCA9IHtcblx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuV29ya3NwYWNlLFxuXHRcdFx0cmVzb3VyY2VzOiBbcmVzb3VyY2UxLCByZXNvdXJjZTJdLFxuXHRcdFx0bGFiZWw6ICd0eXBpbmcgMScsXG5cdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdHVuZG86ICgpID0+IHsgdW5kb0NhbGwxKys7IH0sXG5cdFx0XHRyZWRvOiAoKSA9PiB7IHJlZG9DYWxsMSsrOyB9LFxuXHRcdFx0c3BsaXQ6ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IHJlc291cmNlMSxcblx0XHRcdFx0XHRcdGxhYmVsOiAndHlwaW5nIDEuMScsXG5cdFx0XHRcdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdFx0XHRcdHVuZG86ICgpID0+IHsgdW5kb0NhbGwxMSsrOyB9LFxuXHRcdFx0XHRcdFx0cmVkbzogKCkgPT4geyByZWRvQ2FsbDExKys7IH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6IFVuZG9SZWRvRWxlbWVudFR5cGUuUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UyLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICd0eXBpbmcgMS4yJyxcblx0XHRcdFx0XHRcdGNvZGU6ICd0eXBpbmcnLFxuXHRcdFx0XHRcdFx0dW5kbzogKCkgPT4geyB1bmRvQ2FsbDEyKys7IH0sXG5cdFx0XHRcdFx0XHRyZWRvOiAoKSA9PiB7IHJlZG9DYWxsMTIrKzsgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHNlcnZpY2UucHVzaEVsZW1lbnQoZWxlbWVudDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuVW5kbyhyZXNvdXJjZTEpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5SZWRvKHJlc291cmNlMSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZTEpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZTEpID09PSBlbGVtZW50MSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuVW5kbyhyZXNvdXJjZTIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5SZWRvKHJlc291cmNlMiksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZTIpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZTIpID09PSBlbGVtZW50MSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLnVuZG8ocmVzb3VyY2UxKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblVuZG8ocmVzb3VyY2UxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuaGFzRWxlbWVudHMocmVzb3VyY2UxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHNlcnZpY2UuZ2V0TGFzdEVsZW1lbnQocmVzb3VyY2UxKSA9PT0gbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuVW5kbyhyZXNvdXJjZTIpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY2FuUmVkbyhyZXNvdXJjZTIpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5oYXNFbGVtZW50cyhyZXNvdXJjZTIpLCB0cnVlKTtcblx0XHRhc3NlcnQub2soc2VydmljZS5nZXRMYXN0RWxlbWVudChyZXNvdXJjZTIpID09PSBudWxsKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVkbyhyZXNvdXJjZTIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRvQ2FsbDExLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkb0NhbGwxMSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZG9DYWxsMTIsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRvQ2FsbDEyLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlMSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlMSksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlMSkgPT09IGVsZW1lbnQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5jYW5VbmRvKHJlc291cmNlMiksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNhblJlZG8ocmVzb3VyY2UyKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmhhc0VsZW1lbnRzKHJlc291cmNlMiksIHRydWUpO1xuXHRcdGFzc2VydC5vayhzZXJ2aWNlLmdldExhc3RFbGVtZW50KHJlc291cmNlMikgPT09IGVsZW1lbnQxKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdVbmRvUmVkb0dyb3VwLk5vbmUgdXNlcyBpZCAwJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVbmRvUmVkb0dyb3VwLk5vbmUuaWQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVbmRvUmVkb0dyb3VwLk5vbmUubmV4dE9yZGVyKCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVbmRvUmVkb0dyb3VwLk5vbmUubmV4dE9yZGVyKCksIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlU25hcHNob3QgcHJlc2VydmVzIGVsZW1lbnRzIHRoYXQgbWF0Y2ggdGhlIHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJ3Rlc3QudHh0Jyk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVVuZG9SZWRvU2VydmljZSgpO1xuXG5cdFx0Ly8gUHVzaCB0aHJlZSBlbGVtZW50c1xuXHRcdGNvbnN0IGVsZW1lbnQxOiBJVW5kb1JlZG9FbGVtZW50ID0ge1xuXHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSxcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAndHlwaW5nIDEnLFxuXHRcdFx0Y29kZTogJ3R5cGluZycsXG5cdFx0XHR1bmRvOiAoKSA9PiB7IH0sXG5cdFx0XHRyZWRvOiAoKSA9PiB7IH1cblx0XHR9O1xuXHRcdGNvbnN0IGVsZW1lbnQyOiBJVW5kb1JlZG9FbGVtZW50ID0ge1xuXHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSxcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAndHlwaW5nIDInLFxuXHRcdFx0Y29kZTogJ3R5cGluZycsXG5cdFx0XHR1bmRvOiAoKSA9PiB7IH0sXG5cdFx0XHRyZWRvOiAoKSA9PiB7IH1cblx0XHR9O1xuXHRcdGNvbnN0IGVsZW1lbnQzOiBJVW5kb1JlZG9FbGVtZW50ID0ge1xuXHRcdFx0dHlwZTogVW5kb1JlZG9FbGVtZW50VHlwZS5SZXNvdXJjZSxcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdGxhYmVsOiAndHlwaW5nIDMnLFxuXHRcdFx0Y29kZTogJ3R5cGluZycsXG5cdFx0XHR1bmRvOiAoKSA9PiB7IH0sXG5cdFx0XHRyZWRvOiAoKSA9PiB7IH1cblx0XHR9O1xuXHRcdHNlcnZpY2UucHVzaEVsZW1lbnQoZWxlbWVudDEpO1xuXHRcdHNlcnZpY2UucHVzaEVsZW1lbnQoZWxlbWVudDIpO1xuXHRcdHNlcnZpY2UucHVzaEVsZW1lbnQoZWxlbWVudDMpO1xuXG5cdFx0Ly8gQ3JlYXRlIHNuYXBzaG90IGFmdGVyIDMgZWxlbWVudHM6IFtlbGVtZW50MSwgZWxlbWVudDIsIGVsZW1lbnQzXVxuXHRcdGNvbnN0IHNuYXBzaG90ID0gc2VydmljZS5jcmVhdGVTbmFwc2hvdChyZXNvdXJjZSk7XG5cblx0XHQvLyBQdXNoIG1vcmUgZWxlbWVudHMgYWZ0ZXIgdGhlIHNuYXBzaG90XG5cdFx0Y29uc3QgZWxlbWVudDQ6IElVbmRvUmVkb0VsZW1lbnQgPSB7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICd0eXBpbmcgNCcsXG5cdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdHVuZG86ICgpID0+IHsgfSxcblx0XHRcdHJlZG86ICgpID0+IHsgfVxuXHRcdH07XG5cdFx0Y29uc3QgZWxlbWVudDU6IElVbmRvUmVkb0VsZW1lbnQgPSB7XG5cdFx0XHR0eXBlOiBVbmRvUmVkb0VsZW1lbnRUeXBlLlJlc291cmNlLFxuXHRcdFx0cmVzb3VyY2U6IHJlc291cmNlLFxuXHRcdFx0bGFiZWw6ICd0eXBpbmcgNScsXG5cdFx0XHRjb2RlOiAndHlwaW5nJyxcblx0XHRcdHVuZG86ICgpID0+IHsgfSxcblx0XHRcdHJlZG86ICgpID0+IHsgfVxuXHRcdH07XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50NCk7XG5cdFx0c2VydmljZS5wdXNoRWxlbWVudChlbGVtZW50NSk7XG5cblx0XHQvLyBWZXJpZnkgd2UgaGF2ZSA1IGVsZW1lbnRzIG5vd1xuXHRcdGxldCBlbGVtZW50cyA9IHNlcnZpY2UuZ2V0RWxlbWVudHMocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50cy5wYXN0Lmxlbmd0aCwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRzLmZ1dHVyZS5sZW5ndGgsIDApO1xuXG5cdFx0Ly8gUmVzdG9yZSBzbmFwc2hvdCAtIHNob3VsZCByZW1vdmUgZWxlbWVudDQgYW5kIGVsZW1lbnQ1LCBidXQga2VlcCBlbGVtZW50MSwgZWxlbWVudDIsIGVsZW1lbnQzXG5cdFx0c2VydmljZS5yZXN0b3JlU25hcHNob3Qoc25hcHNob3QpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoYXQgZWxlbWVudHMgbWF0Y2hpbmcgdGhlIHNuYXBzaG90IGFyZSBwcmVzZXJ2ZWRcblx0XHRlbGVtZW50cyA9IHNlcnZpY2UuZ2V0RWxlbWVudHMocmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbGVtZW50cy5wYXN0Lmxlbmd0aCwgMywgJ1Nob3VsZCBoYXZlIDMgcGFzdCBlbGVtZW50cyBhZnRlciByZXN0b3JlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRzLmZ1dHVyZS5sZW5ndGgsIDAsICdTaG91bGQgaGF2ZSAwIGZ1dHVyZSBlbGVtZW50cyBhZnRlciByZXN0b3JlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVsZW1lbnRzLnBhc3RbMF0sIGVsZW1lbnQxLCAnRmlyc3QgZWxlbWVudCBzaG91bGQgYmUgZWxlbWVudDEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudHMucGFzdFsxXSwgZWxlbWVudDIsICdTZWNvbmQgZWxlbWVudCBzaG91bGQgYmUgZWxlbWVudDInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWxlbWVudHMucGFzdFsyXSwgZWxlbWVudDMsICdUaGlyZCBlbGVtZW50IHNob3VsZCBiZSBlbGVtZW50MycpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBMkIscUJBQXFCLHFCQUFxQjtBQUNyRSxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLG1CQUFtQixNQUFNO0FBRTlCLFdBQVMsc0JBQXNCLGdCQUFnQyxJQUFJLGtCQUFrQixHQUFvQjtBQUN4RyxVQUFNLHNCQUFzQixJQUFJLHdCQUF3QjtBQUN4RCxXQUFPLElBQUksZ0JBQWdCLGVBQWUsbUJBQW1CO0FBQUEsRUFDOUQ7QUFFQSxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFVBQU0sV0FBVyxJQUFJLEtBQUssVUFBVTtBQUNwQyxVQUFNLFVBQVUsc0JBQXNCO0FBRXRDLFdBQU8sWUFBWSxRQUFRLFFBQVEsUUFBUSxHQUFHLEtBQUs7QUFDbkQsV0FBTyxZQUFZLFFBQVEsUUFBUSxRQUFRLEdBQUcsS0FBSztBQUNuRCxXQUFPLFlBQVksUUFBUSxZQUFZLFFBQVEsR0FBRyxLQUFLO0FBQ3ZELFdBQU8sR0FBRyxRQUFRLGVBQWUsUUFBUSxNQUFNLElBQUk7QUFFbkQsUUFBSSxZQUFZO0FBQ2hCLFFBQUksWUFBWTtBQUNoQixVQUFNLFdBQTZCO0FBQUEsTUFDbEMsTUFBTSxvQkFBb0I7QUFBQSxNQUMxQjtBQUFBLE1B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
