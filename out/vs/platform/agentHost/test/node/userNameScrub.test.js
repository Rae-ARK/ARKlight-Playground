import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { scrubUserName } from "./e2e/harness/userNameScrub.js";
suite("userNameScrub", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("scrubs the account name in path segments", () => {
    assert.deepStrictEqual([
      "/home/runner/work/file.txt",
      "C:\\Users\\runner\\AppData\\Local",
      "file:///home/runner/x",
      "/home/runner",
      "/home/runner\nnext line",
      "path: '/home/runner'",
      "path: `/home/runner`",
      "path: /home/runner,",
      // Embedded JSON escapes the separator.
      '{"path":"C:\\\\Users\\\\runner\\\\x"}',
      '{"path":"/home/runner"}'
    ].map((text) => scrubUserName(text, "runner")), [
      "/home/${user}/work/file.txt",
      "C:\\Users\\${user}\\AppData\\Local",
      "file:///home/${user}/x",
      "/home/${user}",
      "/home/${user}\nnext line",
      "path: '/home/${user}'",
      "path: `/home/${user}`",
      "path: /home/${user},",
      '{"path":"C:\\\\Users\\\\${user}\\\\x"}',
      '{"path":"/home/${user}"}'
    ]);
  });
  test("scrubs the owner and group columns of an ls -l listing", () => {
    const listing = [
      "drwx------     4 runner  staff     128 Jan  1 12:00 .",
      "-rw-r--r--     1 runner  runner      5 Jan  1 12:00 file-a.txt",
      "-rw-r--r--@    1 other   staff       4 Jan  1 12:00 file-b.txt"
    ].join("\n");
    assert.strictEqual(scrubUserName(listing, "runner"), [
      "drwx------     4 ${user}  staff     128 Jan  1 12:00 .",
      "-rw-r--r--     1 ${user}  ${user}      5 Jan  1 12:00 file-a.txt",
      "-rw-r--r--@    1 other   staff       4 Jan  1 12:00 file-b.txt"
    ].join("\n"));
  });
  test("leaves the account name alone when it is an ordinary word", () => {
    const prose = [
      "the runner completed successfully",
      "Test runner exited with code 0",
      "runner.js",
      "forerunner",
      "runneradmin",
      "a runner-up value",
      "/tmp/runner.js",
      "C:\\Users\\runner-admin\\AppData"
    ];
    assert.deepStrictEqual(prose.map((text) => scrubUserName(text, "runner")), prose);
  });
  test("is a no-op without an account name", () => {
    assert.strictEqual(scrubUserName("/home/runner/x", ""), "/home/runner/x");
  });
  test("escapes regular expression characters in the account name", () => {
    assert.strictEqual(scrubUserName("/home/a.b/x", "a.b"), "/home/${user}/x");
    assert.strictEqual(scrubUserName("/home/axb/x", "a.b"), "/home/axb/x");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvdXNlck5hbWVTY3J1Yi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBzY3J1YlVzZXJOYW1lIH0gZnJvbSAnLi9lMmUvaGFybmVzcy91c2VyTmFtZVNjcnViLmpzJztcblxuLyoqXG4gKiBgcnVubmVyYCBpcyB1c2VkIHRocm91Z2hvdXQgYmVjYXVzZSBpdCBpcyB0aGUgR2l0SHViIEFjdGlvbnMgTGludXggYWNjb3VudFxuICogbmFtZSAqYW5kKiBhbiBvcmRpbmFyeSBFbmdsaXNoIHdvcmQgXHUyMDE0IHRoZSBjYXNlIGEgcGxhaW4gc3Vic3RyaW5nIHJlcGxhY2UgZ2V0c1xuICogd3JvbmcsIGFuZCB0aGUgb25lIHRoYXQgbWF0dGVycyBtb3N0IHNpbmNlIGl0IG9ubHkgbWlzYmVoYXZlcyBvbiBzb21lXG4gKiBwbGF0Zm9ybXMuXG4gKi9cbnN1aXRlKCd1c2VyTmFtZVNjcnViJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3NjcnVicyB0aGUgYWNjb3VudCBuYW1lIGluIHBhdGggc2VnbWVudHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHQnL2hvbWUvcnVubmVyL3dvcmsvZmlsZS50eHQnLFxuXHRcdFx0J0M6XFxcXFVzZXJzXFxcXHJ1bm5lclxcXFxBcHBEYXRhXFxcXExvY2FsJyxcblx0XHRcdCdmaWxlOi8vL2hvbWUvcnVubmVyL3gnLFxuXHRcdFx0Jy9ob21lL3J1bm5lcicsXG5cdFx0XHQnL2hvbWUvcnVubmVyXFxubmV4dCBsaW5lJyxcblx0XHRcdCdwYXRoOiBcXCcvaG9tZS9ydW5uZXJcXCcnLFxuXHRcdFx0J3BhdGg6IGAvaG9tZS9ydW5uZXJgJyxcblx0XHRcdCdwYXRoOiAvaG9tZS9ydW5uZXIsJyxcblx0XHRcdC8vIEVtYmVkZGVkIEpTT04gZXNjYXBlcyB0aGUgc2VwYXJhdG9yLlxuXHRcdFx0J3tcInBhdGhcIjpcIkM6XFxcXFxcXFxVc2Vyc1xcXFxcXFxccnVubmVyXFxcXFxcXFx4XCJ9Jyxcblx0XHRcdCd7XCJwYXRoXCI6XCIvaG9tZS9ydW5uZXJcIn0nLFxuXHRcdF0ubWFwKHRleHQgPT4gc2NydWJVc2VyTmFtZSh0ZXh0LCAncnVubmVyJykpLCBbXG5cdFx0XHQnL2hvbWUvJHt1c2VyfS93b3JrL2ZpbGUudHh0Jyxcblx0XHRcdCdDOlxcXFxVc2Vyc1xcXFwke3VzZXJ9XFxcXEFwcERhdGFcXFxcTG9jYWwnLFxuXHRcdFx0J2ZpbGU6Ly8vaG9tZS8ke3VzZXJ9L3gnLFxuXHRcdFx0Jy9ob21lLyR7dXNlcn0nLFxuXHRcdFx0Jy9ob21lLyR7dXNlcn1cXG5uZXh0IGxpbmUnLFxuXHRcdFx0J3BhdGg6IFxcJy9ob21lLyR7dXNlcn1cXCcnLFxuXHRcdFx0J3BhdGg6IGAvaG9tZS8ke3VzZXJ9YCcsXG5cdFx0XHQncGF0aDogL2hvbWUvJHt1c2VyfSwnLFxuXHRcdFx0J3tcInBhdGhcIjpcIkM6XFxcXFxcXFxVc2Vyc1xcXFxcXFxcJHt1c2VyfVxcXFxcXFxceFwifScsXG5cdFx0XHQne1wicGF0aFwiOlwiL2hvbWUvJHt1c2VyfVwifScsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NjcnVicyB0aGUgb3duZXIgYW5kIGdyb3VwIGNvbHVtbnMgb2YgYW4gbHMgLWwgbGlzdGluZycsICgpID0+IHtcblx0XHQvLyBFeGFjdGx5IHRoZSBzaGFwZSByZWNvcmRlZCBpbiB0aGUgY29tbWl0dGVkIHN1YmFnZW50IGNhcHR1cmUuXG5cdFx0Y29uc3QgbGlzdGluZyA9IFtcblx0XHRcdCdkcnd4LS0tLS0tICAgICA0IHJ1bm5lciAgc3RhZmYgICAgIDEyOCBKYW4gIDEgMTI6MDAgLicsXG5cdFx0XHQnLXJ3LXItLXItLSAgICAgMSBydW5uZXIgIHJ1bm5lciAgICAgIDUgSmFuICAxIDEyOjAwIGZpbGUtYS50eHQnLFxuXHRcdFx0Jy1ydy1yLS1yLS1AICAgIDEgb3RoZXIgICBzdGFmZiAgICAgICA0IEphbiAgMSAxMjowMCBmaWxlLWIudHh0Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY3J1YlVzZXJOYW1lKGxpc3RpbmcsICdydW5uZXInKSwgW1xuXHRcdFx0J2Ryd3gtLS0tLS0gICAgIDQgJHt1c2VyfSAgc3RhZmYgICAgIDEyOCBKYW4gIDEgMTI6MDAgLicsXG5cdFx0XHQnLXJ3LXItLXItLSAgICAgMSAke3VzZXJ9ICAke3VzZXJ9ICAgICAgNSBKYW4gIDEgMTI6MDAgZmlsZS1hLnR4dCcsXG5cdFx0XHQnLXJ3LXItLXItLUAgICAgMSBvdGhlciAgIHN0YWZmICAgICAgIDQgSmFuICAxIDEyOjAwIGZpbGUtYi50eHQnLFxuXHRcdF0uam9pbignXFxuJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgdGhlIGFjY291bnQgbmFtZSBhbG9uZSB3aGVuIGl0IGlzIGFuIG9yZGluYXJ5IHdvcmQnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIHJlZ3Jlc3Npb24gdGhpcyBleGlzdHMgdG8gcHJldmVudDogYSBwbGFpbiBzdWJzdHJpbmcgcmVwbGFjZSB0dXJuc1xuXHRcdC8vIGV2ZXJ5IG9uZSBvZiB0aGVzZSBpbnRvIGAke3VzZXJ9YC5cblx0XHRjb25zdCBwcm9zZSA9IFtcblx0XHRcdCd0aGUgcnVubmVyIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknLFxuXHRcdFx0J1Rlc3QgcnVubmVyIGV4aXRlZCB3aXRoIGNvZGUgMCcsXG5cdFx0XHQncnVubmVyLmpzJyxcblx0XHRcdCdmb3JlcnVubmVyJyxcblx0XHRcdCdydW5uZXJhZG1pbicsXG5cdFx0XHQnYSBydW5uZXItdXAgdmFsdWUnLFxuXHRcdFx0Jy90bXAvcnVubmVyLmpzJyxcblx0XHRcdCdDOlxcXFxVc2Vyc1xcXFxydW5uZXItYWRtaW5cXFxcQXBwRGF0YScsXG5cdFx0XTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3NlLm1hcCh0ZXh0ID0+IHNjcnViVXNlck5hbWUodGV4dCwgJ3J1bm5lcicpKSwgcHJvc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpcyBhIG5vLW9wIHdpdGhvdXQgYW4gYWNjb3VudCBuYW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY3J1YlVzZXJOYW1lKCcvaG9tZS9ydW5uZXIveCcsICcnKSwgJy9ob21lL3J1bm5lci94Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VzY2FwZXMgcmVndWxhciBleHByZXNzaW9uIGNoYXJhY3RlcnMgaW4gdGhlIGFjY291bnQgbmFtZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NydWJVc2VyTmFtZSgnL2hvbWUvYS5iL3gnLCAnYS5iJyksICcvaG9tZS8ke3VzZXJ9L3gnKTtcblx0XHQvLyBUaGUgYC5gIG11c3Qgbm90IGJlaGF2ZSBhcyBhIHdpbGRjYXJkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY3J1YlVzZXJOYW1lKCcvaG9tZS9heGIveCcsICdhLmInKSwgJy9ob21lL2F4Yi94Jyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFROUIsTUFBTSxpQkFBaUIsTUFBTTtBQUU1QiwwQ0FBd0M7QUFFeEMsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsSUFBSSxVQUFRLGNBQWMsTUFBTSxRQUFRLENBQUMsR0FBRztBQUFBLE1BQzdDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUVwRSxVQUFNLFVBQVU7QUFBQSxNQUNmO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsV0FBTyxZQUFZLGNBQWMsU0FBUyxRQUFRLEdBQUc7QUFBQSxNQUNwRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDYixDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUd2RSxVQUFNLFFBQVE7QUFBQSxNQUNiO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxXQUFPLGdCQUFnQixNQUFNLElBQUksVUFBUSxjQUFjLE1BQU0sUUFBUSxDQUFDLEdBQUcsS0FBSztBQUFBLEVBQy9FLENBQUM7QUFFRCxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hELFdBQU8sWUFBWSxjQUFjLGtCQUFrQixFQUFFLEdBQUcsZ0JBQWdCO0FBQUEsRUFDekUsQ0FBQztBQUVELE9BQUssNkRBQTZELE1BQU07QUFDdkUsV0FBTyxZQUFZLGNBQWMsZUFBZSxLQUFLLEdBQUcsaUJBQWlCO0FBRXpFLFdBQU8sWUFBWSxjQUFjLGVBQWUsS0FBSyxHQUFHLGFBQWE7QUFBQSxFQUN0RSxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
