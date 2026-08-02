import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../common/actions.js";
import { MenuService } from "../../common/menuService.js";
import { NullCommandService } from "../../../commands/test/common/nullCommandService.js";
import { MockContextKeyService, MockKeybindingService } from "../../../keybinding/test/common/mockKeybindingService.js";
import { InMemoryStorageService } from "../../../storage/common/storage.js";
const contextKeyService = new class extends MockContextKeyService {
  contextMatchesRules() {
    return true;
  }
}();
suite("MenuService", function() {
  let menuService;
  const disposables = new DisposableStore();
  let testMenuId;
  setup(function() {
    menuService = new MenuService(NullCommandService, new MockKeybindingService(), new InMemoryStorageService());
    testMenuId = new MenuId(`testo/${generateUuid()}`);
    disposables.clear();
  });
  teardown(function() {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("group sorting", function() {
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "one", title: "FOO" },
      group: "0_hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "two", title: "FOO" },
      group: "hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "three", title: "FOO" },
      group: "Hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "four", title: "FOO" },
      group: ""
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "five", title: "FOO" },
      group: "navigation"
    }));
    const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();
    assert.strictEqual(groups.length, 5);
    const [one, two, three, four, five] = groups;
    assert.strictEqual(one[0], "navigation");
    assert.strictEqual(two[0], "0_hello");
    assert.strictEqual(three[0], "hello");
    assert.strictEqual(four[0], "Hello");
    assert.strictEqual(five[0], "");
  });
  test("in group sorting, by title", function() {
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "a", title: "aaa" },
      group: "Hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "b", title: "fff" },
      group: "Hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "c", title: "zzz" },
      group: "Hello"
    }));
    const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();
    assert.strictEqual(groups.length, 1);
    const [, actions] = groups[0];
    assert.strictEqual(actions.length, 3);
    const [one, two, three] = actions;
    assert.strictEqual(one.id, "a");
    assert.strictEqual(two.id, "b");
    assert.strictEqual(three.id, "c");
  });
  test("in group sorting, by title and order", function() {
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "a", title: "aaa" },
      group: "Hello",
      order: 10
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "b", title: "fff" },
      group: "Hello"
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "c", title: "zzz" },
      group: "Hello",
      order: -1
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "d", title: "yyy" },
      group: "Hello",
      order: -1
    }));
    const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();
    assert.strictEqual(groups.length, 1);
    const [, actions] = groups[0];
    assert.strictEqual(actions.length, 4);
    const [one, two, three, four] = actions;
    assert.strictEqual(one.id, "d");
    assert.strictEqual(two.id, "c");
    assert.strictEqual(three.id, "b");
    assert.strictEqual(four.id, "a");
  });
  test("in group sorting, special: navigation", function() {
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "a", title: "aaa" },
      group: "navigation",
      order: 1.3
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "b", title: "fff" },
      group: "navigation",
      order: 1.2
    }));
    disposables.add(MenuRegistry.appendMenuItem(testMenuId, {
      command: { id: "c", title: "zzz" },
      group: "navigation",
      order: 1.1
    }));
    const groups = disposables.add(menuService.createMenu(testMenuId, contextKeyService)).getActions();
    assert.strictEqual(groups.length, 1);
    const [[, actions]] = groups;
    assert.strictEqual(actions.length, 3);
    const [one, two, three] = actions;
    assert.strictEqual(one.id, "c");
    assert.strictEqual(two.id, "b");
    assert.strictEqual(three.id, "a");
  });
  test("special MenuId palette", function() {
    disposables.add(MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: { id: "a", title: "Explicit" }
    }));
    disposables.add(MenuRegistry.addCommand({ id: "b", title: "Implicit" }));
    let foundA = false;
    let foundB = false;
    for (const item of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
      if (isIMenuItem(item)) {
        if (item.command.id === "a") {
          assert.strictEqual(item.command.title, "Explicit");
          foundA = true;
        }
        if (item.command.id === "b") {
          assert.strictEqual(item.command.title, "Implicit");
          foundB = true;
        }
      }
    }
    assert.strictEqual(foundA, true);
    assert.strictEqual(foundB, true);
  });
  test("Extension contributed submenus missing with errors in output #155030", function() {
    const id = generateUuid();
    const menu = new MenuId(id);
    assert.throws(() => new MenuId(id));
    assert.ok(menu === MenuId.for(id));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbnMvdGVzdC9jb21tb24vbWVudVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaXNJTWVudUl0ZW0sIE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbWVudVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbWFuZHMvdGVzdC9jb21tb24vbnVsbENvbW1hbmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSwgTW9ja0tleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4va2V5YmluZGluZy90ZXN0L2NvbW1vbi9tb2NrS2V5YmluZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuXG4vLyAtLS0gc2VydmljZSBpbnN0YW5jZXNcblxuY29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrQ29udGV4dEtleVNlcnZpY2Uge1xuXHRvdmVycmlkZSBjb250ZXh0TWF0Y2hlc1J1bGVzKCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59O1xuXG4vLyAtLS0gdGVzdHNcblxuc3VpdGUoJ01lbnVTZXJ2aWNlJywgZnVuY3Rpb24gKCkge1xuXG5cdGxldCBtZW51U2VydmljZTogTWVudVNlcnZpY2U7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgdGVzdE1lbnVJZDogTWVudUlkO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRtZW51U2VydmljZSA9IG5ldyBNZW51U2VydmljZShOdWxsQ29tbWFuZFNlcnZpY2UsIG5ldyBNb2NrS2V5YmluZGluZ1NlcnZpY2UoKSwgbmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0dGVzdE1lbnVJZCA9IG5ldyBNZW51SWQoYHRlc3RvLyR7Z2VuZXJhdGVVdWlkKCl9YCk7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oZnVuY3Rpb24gKCkge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2dyb3VwIHNvcnRpbmcnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdvbmUnLCB0aXRsZTogJ0ZPTycgfSxcblx0XHRcdGdyb3VwOiAnMF9oZWxsbydcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICd0d28nLCB0aXRsZTogJ0ZPTycgfSxcblx0XHRcdGdyb3VwOiAnaGVsbG8nXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAndGhyZWUnLCB0aXRsZTogJ0ZPTycgfSxcblx0XHRcdGdyb3VwOiAnSGVsbG8nXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnZm91cicsIHRpdGxlOiAnRk9PJyB9LFxuXHRcdFx0Z3JvdXA6ICcnXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnZml2ZScsIHRpdGxlOiAnRk9PJyB9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJ1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGdyb3VwcyA9IGRpc3Bvc2FibGVzLmFkZChtZW51U2VydmljZS5jcmVhdGVNZW51KHRlc3RNZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlKSkuZ2V0QWN0aW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3Vwcy5sZW5ndGgsIDUpO1xuXHRcdGNvbnN0IFtvbmUsIHR3bywgdGhyZWUsIGZvdXIsIGZpdmVdID0gZ3JvdXBzO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uZVswXSwgJ25hdmlnYXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHdvWzBdLCAnMF9oZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlZVswXSwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvdXJbMF0sICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXZlWzBdLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luIGdyb3VwIHNvcnRpbmcsIGJ5IHRpdGxlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnYScsIHRpdGxlOiAnYWFhJyB9LFxuXHRcdFx0Z3JvdXA6ICdIZWxsbydcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdiJywgdGl0bGU6ICdmZmYnIH0sXG5cdFx0XHRncm91cDogJ0hlbGxvJ1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ2MnLCB0aXRsZTogJ3p6eicgfSxcblx0XHRcdGdyb3VwOiAnSGVsbG8nXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzID0gZGlzcG9zYWJsZXMuYWRkKG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUodGVzdE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UpKS5nZXRBY3Rpb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgWywgYWN0aW9uc10gPSBncm91cHNbMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDMpO1xuXHRcdGNvbnN0IFtvbmUsIHR3bywgdGhyZWVdID0gYWN0aW9ucztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25lLmlkLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0d28uaWQsICdiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRocmVlLmlkLCAnYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbiBncm91cCBzb3J0aW5nLCBieSB0aXRsZSBhbmQgb3JkZXInLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdhJywgdGl0bGU6ICdhYWEnIH0sXG5cdFx0XHRncm91cDogJ0hlbGxvJyxcblx0XHRcdG9yZGVyOiAxMFxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ2InLCB0aXRsZTogJ2ZmZicgfSxcblx0XHRcdGdyb3VwOiAnSGVsbG8nXG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnYycsIHRpdGxlOiAnenp6JyB9LFxuXHRcdFx0Z3JvdXA6ICdIZWxsbycsXG5cdFx0XHRvcmRlcjogLTFcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdkJywgdGl0bGU6ICd5eXknIH0sXG5cdFx0XHRncm91cDogJ0hlbGxvJyxcblx0XHRcdG9yZGVyOiAtMVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGdyb3VwcyA9IGRpc3Bvc2FibGVzLmFkZChtZW51U2VydmljZS5jcmVhdGVNZW51KHRlc3RNZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlKSkuZ2V0QWN0aW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3Vwcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IFssIGFjdGlvbnNdID0gZ3JvdXBzWzBdO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCA0KTtcblx0XHRjb25zdCBbb25lLCB0d28sIHRocmVlLCBmb3VyXSA9IGFjdGlvbnM7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9uZS5pZCwgJ2QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHdvLmlkLCAnYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlZS5pZCwgJ2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm91ci5pZCwgJ2EnKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdpbiBncm91cCBzb3J0aW5nLCBzcGVjaWFsOiBuYXZpZ2F0aW9uJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbSh0ZXN0TWVudUlkLCB7XG5cdFx0XHRjb21tYW5kOiB7IGlkOiAnYScsIHRpdGxlOiAnYWFhJyB9LFxuXHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdG9yZGVyOiAxLjNcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKHRlc3RNZW51SWQsIHtcblx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdiJywgdGl0bGU6ICdmZmYnIH0sXG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDEuMlxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0odGVzdE1lbnVJZCwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ2MnLCB0aXRsZTogJ3p6eicgfSxcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRvcmRlcjogMS4xXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzID0gZGlzcG9zYWJsZXMuYWRkKG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUodGVzdE1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UpKS5nZXRBY3Rpb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3JvdXBzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgW1ssIGFjdGlvbnNdXSA9IGdyb3VwcztcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMyk7XG5cdFx0Y29uc3QgW29uZSwgdHdvLCB0aHJlZV0gPSBhY3Rpb25zO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbmUuaWQsICdjJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR3by5pZCwgJ2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWUuaWQsICdhJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NwZWNpYWwgTWVudUlkIHBhbGV0dGUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRcdFx0Y29tbWFuZDogeyBpZDogJ2EnLCB0aXRsZTogJ0V4cGxpY2l0JyB9XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKE1lbnVSZWdpc3RyeS5hZGRDb21tYW5kKHsgaWQ6ICdiJywgdGl0bGU6ICdJbXBsaWNpdCcgfSkpO1xuXG5cdFx0bGV0IGZvdW5kQSA9IGZhbHNlO1xuXHRcdGxldCBmb3VuZEIgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51SWQuQ29tbWFuZFBhbGV0dGUpKSB7XG5cdFx0XHRpZiAoaXNJTWVudUl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0aWYgKGl0ZW0uY29tbWFuZC5pZCA9PT0gJ2EnKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW0uY29tbWFuZC50aXRsZSwgJ0V4cGxpY2l0Jyk7XG5cdFx0XHRcdFx0Zm91bmRBID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaXRlbS5jb21tYW5kLmlkID09PSAnYicpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5jb21tYW5kLnRpdGxlLCAnSW1wbGljaXQnKTtcblx0XHRcdFx0XHRmb3VuZEIgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEEsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3VuZEIsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdFeHRlbnNpb24gY29udHJpYnV0ZWQgc3VibWVudXMgbWlzc2luZyB3aXRoIGVycm9ycyBpbiBvdXRwdXQgIzE1NTAzMCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgbWVudSA9IG5ldyBNZW51SWQoaWQpO1xuXG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBuZXcgTWVudUlkKGlkKSk7XG5cdFx0YXNzZXJ0Lm9rKG1lbnUgPT09IE1lbnVJZC5mb3IoaWQpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtDQUErQztB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
