import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CustomizationType } from "../../../common/state/protocol/channels-session/state.js";
import { codexHooksToContainers, codexSkillsToContainers } from "../../../node/codex/codexCustomizations.js";
suite("codexCustomizations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const skill = (name, scope, path, enabled = true) => ({ name, description: `${name} desc`, path, scope, enabled });
  const skillsResponse = (...entries) => ({ data: entries.map((e) => ({ cwd: e.cwd, skills: e.skills, errors: [] })) });
  const hook = (key, eventName, sourcePath, displayOrder = 0, enabled = true) => ({ key, eventName, handlerType: "command", matcher: null, command: "echo hi", timeoutSec: 5n, statusMessage: null, sourcePath, source: "project", pluginId: null, displayOrder: BigInt(displayOrder), enabled, isManaged: false, currentHash: "h", trustStatus: "trusted" });
  test("groups skills by scope into read-only containers, sorted by name", () => {
    const containers = codexSkillsToContainers(skillsResponse({
      cwd: "/repo",
      skills: [
        skill("beta", "repo", "/repo/.agents/skills/beta/SKILL.md"),
        skill("alpha", "repo", "/repo/.agents/skills/alpha/SKILL.md"),
        skill("gamma", "user", "/home/.agents/skills/gamma/SKILL.md", false)
      ]
    }));
    assert.deepStrictEqual(containers.map((c) => ({
      name: c.name,
      contents: c.contents,
      writable: c.writable,
      children: c.children?.map((ch) => ({ type: ch.type, name: ch.name, enabled: ch.enabled }))
    })), [
      {
        name: "Repository",
        contents: CustomizationType.Skill,
        writable: false,
        children: [
          { type: CustomizationType.Skill, name: "alpha", enabled: true },
          { type: CustomizationType.Skill, name: "beta", enabled: true }
        ]
      },
      {
        name: "User",
        contents: CustomizationType.Skill,
        writable: false,
        children: [{ type: CustomizationType.Skill, name: "gamma", enabled: false }]
      }
    ]);
  });
  test("de-duplicates skills by path across cwd entries and orders scopes repo/user/system", () => {
    const dup = skill("shared", "user", "/home/.agents/skills/shared/SKILL.md");
    const containers = codexSkillsToContainers(skillsResponse(
      { cwd: "/a", skills: [dup, skill("sys", "system", "/sys/imagegen/SKILL.md")] },
      { cwd: "/b", skills: [dup] }
    ));
    assert.deepStrictEqual(containers.map((c) => [c.name, c.children?.length]), [["User", 1], ["Built-in", 1]]);
  });
  test("skill child uri is a file uri and id is stable", () => {
    const [container] = codexSkillsToContainers(skillsResponse({ cwd: "/r", skills: [skill("s", "repo", "/r/.agents/skills/s/SKILL.md")] }));
    const child = container.children[0];
    assert.deepStrictEqual({ uriStartsWith: child.uri.toString().startsWith("file://"), sameId: child.id === codexSkillsToContainers(skillsResponse({ cwd: "/r", skills: [skill("s", "repo", "/r/.agents/skills/s/SKILL.md")] }))[0].children[0].id }, { uriStartsWith: true, sameId: true });
  });
  test("empty / undefined skills responses yield no containers", () => {
    assert.deepStrictEqual([codexSkillsToContainers(void 0), codexSkillsToContainers(skillsResponse()), codexSkillsToContainers(skillsResponse({ cwd: "/x", skills: [] }))], [[], [], []]);
  });
  test("hooks project into a single container, de-duped by key and ordered by displayOrder", () => {
    const containers = codexHooksToContainers({
      data: [{
        cwd: "/repo",
        hooks: [
          hook("k2", "postToolUse", "/repo/.codex/config.toml", 2),
          hook("k1", "preToolUse", "/repo/.codex/config.toml", 1, false),
          hook("k1", "preToolUse", "/repo/.codex/config.toml", 1)
        ],
        warnings: [],
        errors: []
      }]
    });
    assert.deepStrictEqual(containers.map((c) => ({
      name: c.name,
      contents: c.contents,
      writable: c.writable,
      children: c.children?.map((ch) => ({ type: ch.type, name: ch.name, enabled: ch.enabled }))
    })), [{
      name: "Hooks",
      contents: CustomizationType.Hook,
      writable: false,
      children: [
        { type: CustomizationType.Hook, name: "preToolUse", enabled: false },
        { type: CustomizationType.Hook, name: "postToolUse", enabled: true }
      ]
    }]);
  });
  test("empty / undefined hooks responses yield no containers", () => {
    assert.deepStrictEqual([codexHooksToContainers(void 0), codexHooksToContainers({ data: [] }), codexHooksToContainers({ data: [{ cwd: "/x", hooks: [], warnings: [], errors: [] }] })], [[], [], []]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29kZXgvY29kZXhDdXN0b21pemF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IGNvZGV4SG9va3NUb0NvbnRhaW5lcnMsIGNvZGV4U2tpbGxzVG9Db250YWluZXJzIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEN1c3RvbWl6YXRpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgSG9va01ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvSG9va01ldGFkYXRhLmpzJztcbmltcG9ydCB0eXBlIHsgU2tpbGxNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1NraWxsTWV0YWRhdGEuanMnO1xuaW1wb3J0IHR5cGUgeyBTa2lsbFNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvU2tpbGxTY29wZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFNraWxsc0xpc3RSZXNwb25zZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1NraWxsc0xpc3RSZXNwb25zZS5qcyc7XG5cbnN1aXRlKCdjb2RleEN1c3RvbWl6YXRpb25zJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNraWxsID0gKG5hbWU6IHN0cmluZywgc2NvcGU6IFNraWxsU2NvcGUsIHBhdGg6IHN0cmluZywgZW5hYmxlZCA9IHRydWUpOiBTa2lsbE1ldGFkYXRhID0+XG5cdFx0KHsgbmFtZSwgZGVzY3JpcHRpb246IGAke25hbWV9IGRlc2NgLCBwYXRoLCBzY29wZSwgZW5hYmxlZCB9KTtcblxuXHRjb25zdCBza2lsbHNSZXNwb25zZSA9ICguLi5lbnRyaWVzOiB7IGN3ZDogc3RyaW5nOyBza2lsbHM6IFNraWxsTWV0YWRhdGFbXSB9W10pOiBTa2lsbHNMaXN0UmVzcG9uc2UgPT5cblx0XHQoeyBkYXRhOiBlbnRyaWVzLm1hcChlID0+ICh7IGN3ZDogZS5jd2QsIHNraWxsczogZS5za2lsbHMsIGVycm9yczogW10gfSkpIH0pO1xuXG5cdGNvbnN0IGhvb2sgPSAoa2V5OiBzdHJpbmcsIGV2ZW50TmFtZTogSG9va01ldGFkYXRhWydldmVudE5hbWUnXSwgc291cmNlUGF0aDogc3RyaW5nLCBkaXNwbGF5T3JkZXIgPSAwLCBlbmFibGVkID0gdHJ1ZSk6IEhvb2tNZXRhZGF0YSA9PlxuXHRcdCh7IGtleSwgZXZlbnROYW1lLCBoYW5kbGVyVHlwZTogJ2NvbW1hbmQnLCBtYXRjaGVyOiBudWxsLCBjb21tYW5kOiAnZWNobyBoaScsIHRpbWVvdXRTZWM6IDVuLCBzdGF0dXNNZXNzYWdlOiBudWxsLCBzb3VyY2VQYXRoLCBzb3VyY2U6ICdwcm9qZWN0JywgcGx1Z2luSWQ6IG51bGwsIGRpc3BsYXlPcmRlcjogQmlnSW50KGRpc3BsYXlPcmRlciksIGVuYWJsZWQsIGlzTWFuYWdlZDogZmFsc2UsIGN1cnJlbnRIYXNoOiAnaCcsIHRydXN0U3RhdHVzOiAndHJ1c3RlZCcgfSk7XG5cblx0dGVzdCgnZ3JvdXBzIHNraWxscyBieSBzY29wZSBpbnRvIHJlYWQtb25seSBjb250YWluZXJzLCBzb3J0ZWQgYnkgbmFtZScsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXJzID0gY29kZXhTa2lsbHNUb0NvbnRhaW5lcnMoc2tpbGxzUmVzcG9uc2Uoe1xuXHRcdFx0Y3dkOiAnL3JlcG8nLFxuXHRcdFx0c2tpbGxzOiBbXG5cdFx0XHRcdHNraWxsKCdiZXRhJywgJ3JlcG8nLCAnL3JlcG8vLmFnZW50cy9za2lsbHMvYmV0YS9TS0lMTC5tZCcpLFxuXHRcdFx0XHRza2lsbCgnYWxwaGEnLCAncmVwbycsICcvcmVwby8uYWdlbnRzL3NraWxscy9hbHBoYS9TS0lMTC5tZCcpLFxuXHRcdFx0XHRza2lsbCgnZ2FtbWEnLCAndXNlcicsICcvaG9tZS8uYWdlbnRzL3NraWxscy9nYW1tYS9TS0lMTC5tZCcsIGZhbHNlKSxcblx0XHRcdF0sXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGFpbmVycy5tYXAoYyA9PiAoe1xuXHRcdFx0bmFtZTogYy5uYW1lLFxuXHRcdFx0Y29udGVudHM6IGMuY29udGVudHMsXG5cdFx0XHR3cml0YWJsZTogYy53cml0YWJsZSxcblx0XHRcdGNoaWxkcmVuOiBjLmNoaWxkcmVuPy5tYXAoY2ggPT4gKHsgdHlwZTogY2gudHlwZSwgbmFtZTogY2gubmFtZSwgZW5hYmxlZDogKGNoIGFzIHsgZW5hYmxlZD86IGJvb2xlYW4gfSkuZW5hYmxlZCB9KSksXG5cdFx0fSkpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdSZXBvc2l0b3J5JywgY29udGVudHM6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCB3cml0YWJsZTogZmFsc2UsXG5cdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgbmFtZTogJ2FscGhhJywgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsIG5hbWU6ICdiZXRhJywgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ1VzZXInLCBjb250ZW50czogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsIHdyaXRhYmxlOiBmYWxzZSxcblx0XHRcdFx0Y2hpbGRyZW46IFt7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCBuYW1lOiAnZ2FtbWEnLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlLWR1cGxpY2F0ZXMgc2tpbGxzIGJ5IHBhdGggYWNyb3NzIGN3ZCBlbnRyaWVzIGFuZCBvcmRlcnMgc2NvcGVzIHJlcG8vdXNlci9zeXN0ZW0nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHVwID0gc2tpbGwoJ3NoYXJlZCcsICd1c2VyJywgJy9ob21lLy5hZ2VudHMvc2tpbGxzL3NoYXJlZC9TS0lMTC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRhaW5lcnMgPSBjb2RleFNraWxsc1RvQ29udGFpbmVycyhza2lsbHNSZXNwb25zZShcblx0XHRcdHsgY3dkOiAnL2EnLCBza2lsbHM6IFtkdXAsIHNraWxsKCdzeXMnLCAnc3lzdGVtJywgJy9zeXMvaW1hZ2VnZW4vU0tJTEwubWQnKV0gfSxcblx0XHRcdHsgY3dkOiAnL2InLCBza2lsbHM6IFtkdXBdIH0sXG5cdFx0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250YWluZXJzLm1hcChjID0+IFtjLm5hbWUsIGMuY2hpbGRyZW4/Lmxlbmd0aF0pLCBbWydVc2VyJywgMV0sIFsnQnVpbHQtaW4nLCAxXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lsbCBjaGlsZCB1cmkgaXMgYSBmaWxlIHVyaSBhbmQgaWQgaXMgc3RhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IFtjb250YWluZXJdID0gY29kZXhTa2lsbHNUb0NvbnRhaW5lcnMoc2tpbGxzUmVzcG9uc2UoeyBjd2Q6ICcvcicsIHNraWxsczogW3NraWxsKCdzJywgJ3JlcG8nLCAnL3IvLmFnZW50cy9za2lsbHMvcy9TS0lMTC5tZCcpXSB9KSk7XG5cdFx0Y29uc3QgY2hpbGQgPSBjb250YWluZXIuY2hpbGRyZW4hWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyB1cmlTdGFydHNXaXRoOiBjaGlsZC51cmkudG9TdHJpbmcoKS5zdGFydHNXaXRoKCdmaWxlOi8vJyksIHNhbWVJZDogY2hpbGQuaWQgPT09IGNvZGV4U2tpbGxzVG9Db250YWluZXJzKHNraWxsc1Jlc3BvbnNlKHsgY3dkOiAnL3InLCBza2lsbHM6IFtza2lsbCgncycsICdyZXBvJywgJy9yLy5hZ2VudHMvc2tpbGxzL3MvU0tJTEwubWQnKV0gfSkpWzBdLmNoaWxkcmVuIVswXS5pZCB9LCB7IHVyaVN0YXJ0c1dpdGg6IHRydWUsIHNhbWVJZDogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgLyB1bmRlZmluZWQgc2tpbGxzIHJlc3BvbnNlcyB5aWVsZCBubyBjb250YWluZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2NvZGV4U2tpbGxzVG9Db250YWluZXJzKHVuZGVmaW5lZCksIGNvZGV4U2tpbGxzVG9Db250YWluZXJzKHNraWxsc1Jlc3BvbnNlKCkpLCBjb2RleFNraWxsc1RvQ29udGFpbmVycyhza2lsbHNSZXNwb25zZSh7IGN3ZDogJy94Jywgc2tpbGxzOiBbXSB9KSldLCBbW10sIFtdLCBbXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdob29rcyBwcm9qZWN0IGludG8gYSBzaW5nbGUgY29udGFpbmVyLCBkZS1kdXBlZCBieSBrZXkgYW5kIG9yZGVyZWQgYnkgZGlzcGxheU9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lcnMgPSBjb2RleEhvb2tzVG9Db250YWluZXJzKHtcblx0XHRcdGRhdGE6IFt7XG5cdFx0XHRcdGN3ZDogJy9yZXBvJyxcblx0XHRcdFx0aG9va3M6IFtcblx0XHRcdFx0XHRob29rKCdrMicsICdwb3N0VG9vbFVzZScsICcvcmVwby8uY29kZXgvY29uZmlnLnRvbWwnLCAyKSxcblx0XHRcdFx0XHRob29rKCdrMScsICdwcmVUb29sVXNlJywgJy9yZXBvLy5jb2RleC9jb25maWcudG9tbCcsIDEsIGZhbHNlKSxcblx0XHRcdFx0XHRob29rKCdrMScsICdwcmVUb29sVXNlJywgJy9yZXBvLy5jb2RleC9jb25maWcudG9tbCcsIDEpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHR3YXJuaW5nczogW10sXG5cdFx0XHRcdGVycm9yczogW10sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRhaW5lcnMubWFwKGMgPT4gKHtcblx0XHRcdG5hbWU6IGMubmFtZSwgY29udGVudHM6IGMuY29udGVudHMsIHdyaXRhYmxlOiBjLndyaXRhYmxlLFxuXHRcdFx0Y2hpbGRyZW46IGMuY2hpbGRyZW4/Lm1hcChjaCA9PiAoeyB0eXBlOiBjaC50eXBlLCBuYW1lOiBjaC5uYW1lLCBlbmFibGVkOiAoY2ggYXMgeyBlbmFibGVkPzogYm9vbGVhbiB9KS5lbmFibGVkIH0pKSxcblx0XHR9KSksIFt7XG5cdFx0XHRuYW1lOiAnSG9va3MnLCBjb250ZW50czogQ3VzdG9taXphdGlvblR5cGUuSG9vaywgd3JpdGFibGU6IGZhbHNlLFxuXHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ib29rLCBuYW1lOiAncHJlVG9vbFVzZScsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuSG9vaywgbmFtZTogJ3Bvc3RUb29sVXNlJywgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IC8gdW5kZWZpbmVkIGhvb2tzIHJlc3BvbnNlcyB5aWVsZCBubyBjb250YWluZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2NvZGV4SG9va3NUb0NvbnRhaW5lcnModW5kZWZpbmVkKSwgY29kZXhIb29rc1RvQ29udGFpbmVycyh7IGRhdGE6IFtdIH0pLCBjb2RleEhvb2tzVG9Db250YWluZXJzKHsgZGF0YTogW3sgY3dkOiAnL3gnLCBob29rczogW10sIHdhcm5pbmdzOiBbXSwgZXJyb3JzOiBbXSB9XSB9KV0sIFtbXSwgW10sIFtdXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0IsK0JBQStCO0FBTWhFLE1BQU0sdUJBQXVCLE1BQU07QUFFbEMsMENBQXdDO0FBRXhDLFFBQU0sUUFBUSxDQUFDLE1BQWMsT0FBbUIsTUFBYyxVQUFVLFVBQ3RFLEVBQUUsTUFBTSxhQUFhLEdBQUcsSUFBSSxTQUFTLE1BQU0sT0FBTyxRQUFRO0FBRTVELFFBQU0saUJBQWlCLElBQUksYUFDekIsRUFBRSxNQUFNLFFBQVEsSUFBSSxRQUFNLEVBQUUsS0FBSyxFQUFFLEtBQUssUUFBUSxFQUFFLFFB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
