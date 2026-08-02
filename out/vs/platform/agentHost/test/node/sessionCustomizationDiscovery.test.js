import assert from "assert";
import { DeferredPromise, raceTimeout, timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { DiscoveredType, SessionCustomizationDiscovery } from "../../node/copilot/sessionCustomizationDiscovery.js";
import { SessionPluginBundler } from "../../node/shared/sessionPluginBundler.js";
import { mapToParsedPlugin, toDiscoveredDirectoryCustomizations } from "../../node/copilot/copilotAgent.js";
suite("SessionCustomizationDiscovery", () => {
  const disposables = new DisposableStore();
  let fileService;
  let instantiationService;
  let workspace;
  let userHome;
  let pluginBasePath;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const memFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
    userHome = URI.from({ scheme: Schemas.inMemory, path: "/home" });
    pluginBasePath = URI.from({ scheme: Schemas.inMemory, path: "/agentPlugins" });
    instantiationService.stub(IAgentPluginManager, { basePath: pluginBasePath });
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function seed(path, content = "") {
    const uri = URI.from({ scheme: Schemas.inMemory, path });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
    return uri;
  }
  const inMemoryPathToUri = (path) => URI.from({ scheme: Schemas.inMemory, path: path.replace(/\\/g, "/") });
  test("discovers supported agent instruction files in workspace roots", async () => {
    const wsCopilotInstructions = await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    const wsGeminiInstructions = await seed("/workspace/GEMINI.md", "workspace gemini instructions");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type }))).filter((entry) => entry.type === DiscoveredType.AgentInstruction).map((entry) => entry.uri.toString()).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(files, [
      wsCopilotInstructions.toString(),
      wsGeminiInstructions.toString()
    ].sort((a, b) => a.localeCompare(b)));
  });
  test("groups discovered customizations by parent folder", async () => {
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          discover: async () => ({
            agents: [
              { id: "one", name: "One", description: "", path: "/workspace/.github/agents/one.agent.md", userInvocable: false },
              { id: "two", name: "Two", description: "", path: "/workspace/.github/agents/two.agent.md", userInvocable: true },
              { id: "three", name: "Three", description: "", path: "/workspace/.github/other/three.agent.md", userInvocable: false }
            ]
          })
        },
        instructions: { discover: async () => ({ sources: [] }) },
        skills: { discover: async () => ({ skills: [] }) }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const agentDirectories = customizations.filter((customization) => customization.contents === "agent");
    const getPath = (uri) => URI.parse(uri).path;
    assert.strictEqual(agentDirectories.length, 2);
    assert.deepStrictEqual(agentDirectories.map((customization) => getPath(customization.uri)).sort(), [
      "/workspace/.github/agents",
      "/workspace/.github/other"
    ]);
    const agentsInAgentsDir = agentDirectories.find((customization) => getPath(customization.uri) === "/workspace/.github/agents");
    assert.ok(agentsInAgentsDir);
    assert.deepStrictEqual(agentsInAgentsDir.children?.map((child) => getPath(child.uri)).sort(), [
      "/workspace/.github/agents/one.agent.md",
      "/workspace/.github/agents/two.agent.md"
    ]);
  });
  test("discover includes hooks from recursive and fixed hook locations", async () => {
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": []}}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ sources: [] })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ skills: [] })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const hookDirectories = customizations.filter((customization) => customization.contents === "hook").map((customization) => ({
      uri: URI.parse(customization.uri).path,
      children: (customization.children ?? []).map((child) => URI.parse(child.uri).path).sort()
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual(hookDirectories, [
      { uri: "/home/.copilot/hooks", children: [] },
      { uri: "/workspace/.github/copilot", children: ["/workspace/.github/copilot/settings.json"] },
      { uri: "/workspace/.github/hooks", children: ["/workspace/.github/hooks/pre-tool.json"] }
    ]);
  });
  test("marks agent instruction rule sources as always apply", async () => {
    await seed("/workspace/AGENTS.md", "workspace agents instructions");
    await seed("/workspace/.github/instructions/rule.instructions.md", "scoped instruction");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/instructions", kind: "directory" },
              { path: "/workspace/AGENTS.md", kind: "file" }
            ]
          }),
          discover: async () => ({
            sources: [
              { id: "agentInstruction", label: "AGENTS.md", sourcePath: "/workspace/AGENTS.md", applyTo: [], type: "repo" },
              { id: "scopedInstruction", label: "Rule", sourcePath: "/workspace/.github/instructions/rule.instructions.md", applyTo: ["src/**"], type: "child-instructions" }
            ]
          })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ skills: [] })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const rules = customizations.filter((customization) => customization.contents === "rule").flatMap((customization) => customization.children ?? []).map((child) => ({
      uri: URI.parse(child.uri).path,
      alwaysApply: child.type === "rule" ? child.alwaysApply : void 0
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual(rules, [
      { uri: "/workspace/.github/instructions/rule.instructions.md", alwaysApply: false },
      { uri: "/workspace/AGENTS.md", alwaysApply: true }
    ]);
  });
  test("drops missing agent instruction files and empty agent instruction directories", async () => {
    await seed("/workspace/.github/instructions/rule.instructions.md", "scoped instruction");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/instructions", kind: "directory" },
              { path: "/workspace/AGENTS.md", kind: "file" }
            ]
          }),
          discover: async () => ({
            sources: [
              { id: "agentInstruction", label: "AGENTS.md", sourcePath: "/workspace/AGENTS.md", applyTo: [], type: "repo" },
              { id: "scopedInstruction", label: "Rule", sourcePath: "/workspace/.github/instructions/rule.instructions.md", applyTo: ["src/**"], type: "child-instructions" }
            ]
          })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ skills: [] })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const ruleDirectories = customizations.filter((customization) => customization.contents === "rule").map((customization) => ({
      uri: URI.parse(customization.uri).path,
      children: (customization.children ?? []).map((child) => URI.parse(child.uri).path).sort()
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual(ruleDirectories, [
      { uri: "/workspace/.github/instructions", children: ["/workspace/.github/instructions/rule.instructions.md"] }
    ]);
  });
  test("discover returns working-directory agents, skills, instructions, hooks, and agent instructions", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    await seed("/workspace/.github/instructions/baz.instructions.md", "instruction body");
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": []}}');
    await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    await seed("/workspace/AGENTS.md", "workspace agents instructions");
    await seed("/home/.copilot/copilot-instructions.md", "user copilot instructions");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [{ path: "/workspace/.github/agents" }] }),
          discover: async () => ({
            agents: [
              { id: "agent", name: "Agent", description: "agent description", path: "/workspace/.github/agents/foo.agent.md", userInvocable: true }
            ]
          })
        },
        instructions: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/instructions", kind: "directory" },
              { path: "/workspace/.github/copilot-instructions.md", kind: "file" },
              { path: "/workspace/AGENTS.md", kind: "file" },
              { path: "/home/.copilot/copilot-instructions.md", kind: "file" }
            ]
          }),
          discover: async () => ({
            sources: [
              { id: "rule", label: "Rule", description: "rule description", sourcePath: "/workspace/.github/instructions/baz.instructions.md", applyTo: [] }
            ]
          })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [{ path: "/workspace/.github/skills" }] }),
          discover: async () => ({
            skills: [
              { name: "Skill", description: "skill description", path: "/workspace/.github/skills/bar/SKILL.md" }
            ]
          })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const directories = customizations.map((customization) => ({
      contents: customization.contents,
      uri: URI.parse(customization.uri).path,
      writable: customization.writable,
      children: (customization.children ?? []).map((child) => URI.parse(child.uri).path).sort()
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual(directories, [
      { contents: "rule", uri: "/home", writable: false, children: ["/home/.copilot/copilot-instructions.md"] },
      { contents: "hook", uri: "/home/.copilot/hooks", writable: true, children: [] },
      { contents: "rule", uri: "/workspace", writable: false, children: ["/workspace/.github/copilot-instructions.md", "/workspace/AGENTS.md"] },
      { contents: "agent", uri: "/workspace/.github/agents", writable: true, children: ["/workspace/.github/agents/foo.agent.md"] },
      { contents: "hook", uri: "/workspace/.github/copilot", writable: true, children: ["/workspace/.github/copilot/settings.json"] },
      { contents: "hook", uri: "/workspace/.github/hooks", writable: true, children: ["/workspace/.github/hooks/pre-tool.json"] },
      { contents: "rule", uri: "/workspace/.github/instructions", writable: true, children: ["/workspace/.github/instructions/baz.instructions.md"] },
      { contents: "skill", uri: "/workspace/.github/skills", writable: true, children: ["/workspace/.github/skills/bar/SKILL.md"] }
    ]);
  });
  test("discover groups case-variant instructions and nested skills under their roots", async () => {
    const caseVariantUserHome = URI.from({ scheme: Schemas.inMemory, path: "/HOME" });
    await seed("/home/.copilot/copilot-instructions.md", "user copilot instructions");
    await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], caseVariantUserHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({ paths: [{ path: "/home/.copilot/copilot-instructions.md", kind: "file" }] }),
          discover: async () => ({ sources: [{ id: "userInstruction", label: "User instruction", sourcePath: "/home/.copilot/copilot-instructions.md", type: "home" }] })
        },
        skills: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/skills" },
              { path: "/workspace/.github/skills/bar" }
            ]
          }),
          discover: async () => ({ skills: [{ name: "Skill", description: "skill description", path: "/workspace/.github/skills/bar/SKILL.md" }] })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const directories = customizations.filter((customization) => customization.contents === "rule" || customization.contents === "skill").map((customization) => ({
      contents: customization.contents,
      uri: URI.parse(customization.uri).path,
      children: (customization.children ?? []).map((child) => URI.parse(child.uri).path)
    }));
    assert.deepStrictEqual(directories, [
      { contents: "rule", uri: "/HOME", children: ["/home/.copilot/copilot-instructions.md"] },
      { contents: "skill", uri: "/workspace/.github/skills", children: ["/workspace/.github/skills/bar/SKILL.md"] }
    ]);
  });
  test("returns directories sorted by type and URI", async () => {
    await seed("/workspace/.github/agents/aaa.agent.md", "workspace agent a");
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    await seed("/workspace/.github/skills/alpha/SKILL.md", "workspace skill alpha");
    await seed("/workspace/.github/skills/bar/SKILL.md", "workspace skill");
    await seed("/workspace/.github/instructions/alpha.instructions.md", "workspace instruction alpha");
    await seed("/workspace/.github/instructions/baz.instructions.md", "workspace instruction");
    await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    await seed("/home/.copilot/agents/abc.agent.md", "user agent abc");
    await seed("/home/.copilot/agents/qux.agent.md", "user agent");
    await seed("/home/.copilot/skills/alpha/SKILL.md", "user copilot skill");
    await seed("/home/.agents/skills/aaa/SKILL.md", "user skill aaa");
    await seed("/home/.agents/skills/zap/SKILL.md", "user skill");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const directories = await discovery.scan(CancellationToken.None);
    const actual = directories.map((directory) => `${directory.type}:${directory.uri.toString()}`);
    const expected = [...actual].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    assert.deepStrictEqual(actual, expected);
    for (const directory of directories) {
      const actualFiles = directory.files.map((file) => file.uri.toString());
      const expectedFiles = [...actualFiles].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      assert.deepStrictEqual(actualFiles, expectedFiles);
    }
  });
  test("does not discover agent instruction files outside supported roots", async () => {
    await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    await seed("/workspace/docs/AGENTS.md", "unsupported root");
    await seed("/workspace/.claude/GEMINI.md", "unsupported filename in .claude");
    await seed("/home/copilot-instructions.md", "unsupported home root");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type }))).filter((entry) => entry.type === DiscoveredType.AgentInstruction).map((entry) => entry.uri.toString()).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(files, [
      URI.from({ scheme: Schemas.inMemory, path: "/workspace/.github/copilot-instructions.md" }).toString()
    ]);
  });
  test("installs watchers for roots that contain discovered customizations", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    await seed("/workspace/.github/skills/bar/SKILL.md", "workspace skill");
    await seed("/workspace/.github/instructions/rules.instructions.md", "workspace instruction");
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    await seed("/workspace/.claude/CLAUDE.md", "workspace claude instruction");
    await seed("/home/.copilot/agents/user.agent.md", "user agent");
    await seed("/home/.copilot/skills/copilot-user-skill/SKILL.md", "user copilot skill");
    await seed("/home/.agents/skills/user-skill/SKILL.md", "user skill");
    await seed("/home/.copilot/instructions/user.instructions.md", "user instruction");
    await seed("/home/.copilot/hooks/post-tool.json", '{"PostToolUse": []}');
    await seed("/home/.copilot/copilot-instructions.md", "user copilot instructions");
    const watchCalls = [];
    const originalWatch = fileService.watch.bind(fileService);
    disposables.add({ dispose: () => {
      fileService.watch = originalWatch;
    } });
    fileService.watch = ((resource, options) => {
      watchCalls.push({ resource: resource.toString(), recursive: options?.recursive === true });
      return originalWatch(resource, options);
    });
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    const watched = /* @__PURE__ */ new Map();
    for (const call of watchCalls) {
      const previous = watched.get(call.resource);
      watched.set(call.resource, previous === true || call.recursive);
    }
    assert.strictEqual(watched.get(workspace.toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".claude").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github", "agents").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github", "skills").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github", "instructions").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github", "hooks").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot", "agents").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot", "skills").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".agents", "skills").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot", "instructions").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot", "hooks").toString()), true);
  });
  test("refresh keeps existing watchers when discovered roots are unchanged", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const watchCalls = [];
    let watchDisposeCalls = 0;
    const originalWatch = fileService.watch.bind(fileService);
    disposables.add({ dispose: () => {
      fileService.watch = originalWatch;
    } });
    fileService.watch = ((resource, options) => {
      watchCalls.push(resource.toString());
      const disposable = originalWatch(resource, options);
      return {
        dispose: () => {
          watchDisposeCalls++;
          disposable.dispose();
        }
      };
    });
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    const watchCallsAfterFirstScan = watchCalls.length;
    await discovery.scan(CancellationToken.None);
    assert.strictEqual(watchCalls.length, watchCallsAfterFirstScan, "expected no new watch registrations for unchanged roots");
    assert.strictEqual(watchDisposeCalls, 0, "expected existing watchers to remain active for unchanged roots");
  });
  test("fires onDidChange when a new agent file is added under a non-recursively watched root", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/.github/agents/bar.agent.md", "new workspace agent");
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire for a new agent file inside the watched directory");
  });
  test("fires onDidChange when an existing agent file is modified under a non-recursively watched root", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent (updated)");
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when an existing agent file is modified");
  });
  test("fires onDidChange when an existing agent file is deleted under a non-recursively watched root", async () => {
    const agentUri = await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    await seed("/workspace/.github/agents/bar.agent.md", "workspace agent bar");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await fileService.del(agentUri);
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when an existing agent file is deleted");
  });
  test("fires onDidChange when AGENTS.md in the workspace root is modified", async () => {
    await seed("/workspace/AGENTS.md", "agents instructions");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/AGENTS.md", "agents instructions (updated)");
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when AGENTS.md at the workspace root is modified");
  });
  test("does not fire onDidChange for files outside any trigger URI", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
    }));
    await seed("/workspace/.git/HEAD", "ref: refs/heads/main");
    await seed("/workspace/.vscode/settings.json", "{}");
    await seed("/workspace/README.md", "# project");
    await seed("/workspace/src/index.ts", "export {};");
    await timeout(100);
    assert.strictEqual(changeCount, 0, "expected onDidChange not to fire for paths outside any trigger URI");
  });
  test("discover mode watches the discovered skill root so new skills fire onDidChange", async () => {
    await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: "/workspace/.github/skills" }));
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ sources: [] })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [{ path: "/workspace/.github/skills" }] }),
          discover: async () => ({ skills: [] })
        }
      }
    };
    await discovery.discover(client, CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/.github/skills/new-skill/SKILL.md", "new workspace skill");
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when a skill is added under the discovered skill root");
  });
  test("cancellation of one caller does not affect another concurrent caller", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const cancelSource = new CancellationTokenSource();
    disposables.add(cancelSource);
    const cancelled = discovery.scan(cancelSource.token);
    const nonCancelled = discovery.scan(CancellationToken.None);
    cancelSource.cancel();
    await assert.rejects(cancelled);
    const directories = await nonCancelled;
    assert.ok(directories.some((directory) => directory.type === DiscoveredType.Agent));
  });
  test("discovers agents, skills, instructions, and hooks across workspace and home roots", async () => {
    const wsAgent = await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    const wsSkill = await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    const wsInstr = await seed("/workspace/.github/instructions/baz.instructions.md", "instr body");
    const wsHook = await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    const userAgent = await seed("/home/.copilot/agents/qux.agent.md", "user agent");
    const userCopilotSkill = await seed("/home/.copilot/skills/copilot-zap/SKILL.md", "user copilot skill");
    const userSkill = await seed("/home/.agents/skills/zap/SKILL.md", "user skill");
    const userHook = await seed("/home/.copilot/hooks/post-tool.json", '{"PostToolUse": []}');
    await seed("/workspace/.github/agents/not-an-agent.txt", "ignored");
    await seed("/workspace/.github/hooks/not-a-hook.md", "ignored");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const directories = await discovery.scan(CancellationToken.None);
    const files = directories.flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: userAgent, type: DiscoveredType.Agent },
      { uri: userCopilotSkill, type: DiscoveredType.Skill },
      { uri: userHook, type: DiscoveredType.Hook },
      { uri: userSkill, type: DiscoveredType.Skill },
      { uri: wsAgent, type: DiscoveredType.Agent },
      { uri: wsHook, type: DiscoveredType.Hook },
      { uri: wsInstr, type: DiscoveredType.Instruction },
      { uri: wsSkill, type: DiscoveredType.Skill }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
    assert.ok(directories.some((directory) => directory.uri.toString() === URI.joinPath(workspace, ".github", "agents").toString()));
  });
  test("discovers nested .json hook files", async () => {
    const nestedWsHook = await seed("/workspace/.github/hooks/team/security/pre-tool.json", '{"PreToolUse": []}');
    const nestedUserHook = await seed("/home/.copilot/hooks/domain/tools/post-tool.json", '{"PostToolUse": []}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: nestedUserHook, type: DiscoveredType.Hook },
      { uri: nestedWsHook, type: DiscoveredType.Hook }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("discovers hook settings files from fixed workspace locations", async () => {
    const githubSettings = await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": []}}');
    const githubLocalSettings = await seed("/workspace/.github/copilot/settings.local.json", '{"hooks": {"PostToolUse": []}}');
    const claudeSettings = await seed("/workspace/.claude/settings.json", '{"hooks": {"SessionStart": []}}');
    const claudeLocalSettings = await seed("/workspace/.claude/settings.local.json", '{"hooks": {"SessionEnd": []}}');
    await seed("/workspace/.github/copilot/settings.dev.json", '{"hooks": {"Ignored": []}}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: claudeLocalSettings, type: DiscoveredType.Hook },
      { uri: claudeSettings, type: DiscoveredType.Hook },
      { uri: githubLocalSettings, type: DiscoveredType.Hook },
      { uri: githubSettings, type: DiscoveredType.Hook }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("fires onDidChange when fixed hook settings file is modified", async () => {
    await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": []}}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": [{"command": "echo test"}]}}');
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when fixed hook settings file is modified");
  });
  test("excludes exact-case README.md inside agent folders", async () => {
    const wsAgent = await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    const wsPlainAgent = await seed("/workspace/.github/agents/plain.md", "plain agent body");
    const wsLowerReadmeAgent = await seed("/workspace/.github/agents/readme.md", "docs lower");
    await seed("/workspace/.github/agents/README.md", "docs");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: wsAgent, type: DiscoveredType.Agent },
      { uri: wsLowerReadmeAgent, type: DiscoveredType.Agent },
      { uri: wsPlainAgent, type: DiscoveredType.Agent }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("includes non-README markdown files inside agent folders", async () => {
    const wsAgent = await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    const wsLegacyMode = await seed("/workspace/.github/agents/legacy.chatmode.md", "legacy mode body");
    const wsPrompt = await seed("/workspace/.github/agents/bar.prompt.md", "prompt body");
    const wsInstruction = await seed("/workspace/.github/agents/baz.instructions.md", "instruction body");
    const wsCopilotInstructions = await seed("/workspace/.github/agents/copilot-instructions.md", "copilot instructions body");
    const wsSkill = await seed("/workspace/.github/agents/SKILL.md", "skill body");
    const wsSkillLowercase = await seed("/workspace/.github/agents/skill.md", "skill body lowercase");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: wsCopilotInstructions, type: DiscoveredType.Agent },
      { uri: wsAgent, type: DiscoveredType.Agent },
      { uri: wsInstruction, type: DiscoveredType.Agent },
      { uri: wsLegacyMode, type: DiscoveredType.Agent },
      { uri: wsPrompt, type: DiscoveredType.Agent },
      { uri: wsSkill, type: DiscoveredType.Agent },
      { uri: wsSkillLowercase, type: DiscoveredType.Agent }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("discovers nested .instructions.md files", async () => {
    const nestedWsInstr = await seed("/workspace/.github/instructions/team/security/policy.instructions.md", "workspace nested instruction");
    const nestedUserInstr = await seed("/home/.copilot/instructions/domain/tools/deep.instructions.md", "user nested instruction");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: nestedUserInstr, type: DiscoveredType.Instruction },
      { uri: nestedWsInstr, type: DiscoveredType.Instruction }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("bundles nested .instructions.md files into rules", async () => {
    await seed("/workspace/.github/instructions/team/security/policy.instructions.md", "workspace nested instruction");
    await seed("/home/.copilot/instructions/domain/tools/deep.instructions.md", "user nested instruction");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    const result = await bundler.bundle(await discovery.scan(CancellationToken.None));
    assert.ok(result);
    const root = bundler.rootUri;
    const workspaceInstr = await fileService.readFile(URI.joinPath(root, "rules", "policy.instructions.md"));
    assert.strictEqual(workspaceInstr.value.toString(), "workspace nested instruction");
    const userInstr = await fileService.readFile(URI.joinPath(root, "rules", "deep.instructions.md"));
    assert.strictEqual(userInstr.value.toString(), "user nested instruction");
  });
  test("returns undefined when no files were discovered", async () => {
    await fileService.createFolder(workspace);
    await fileService.createFolder(userHome);
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const directories = await discovery.scan(CancellationToken.None);
    assert.ok(Array.isArray(directories), `Expected directories to be an array, got ${JSON.stringify(directories)}`);
    if (directories.length === 0) {
      return;
    }
    for (const dir of directories) {
      assert.strictEqual(dir.files.length, 0, `Expected ${dir.uri.toString()} to have no files`);
    }
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    await bundler.bundle(directories);
  });
  test("maps discovered files to parsed plugin preserving source URIs", async () => {
    const agent = await seed("/workspace/.github/agents/foo.agent.md", "---\nname: Workspace Agent\ndescription: Agent description\n---\nbody");
    const skill = await seed("/workspace/.github/skills/bar/SKILL.md", "---\nname: Workspace Skill\ndescription: Skill description\n---\nbody");
    const instruction = await seed("/workspace/.github/instructions/baz.instructions.md", "---\nname: Workspace Rule\ndescription: Rule description\nglobs:\n  - src/**\n---\nbody");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);
    const plugin = mapToParsedPlugin(customizations);
    assert.ok(plugin);
    assert.strictEqual(plugin.agents.length, 1);
    assert.strictEqual(plugin.skills.length, 1);
    assert.strictEqual(plugin.instructions.length, 1);
    assert.deepStrictEqual(
      {
        agentUri: plugin.agents[0].uri.toString(),
        agentDescription: plugin.agents[0].description,
        skillUri: plugin.skills[0].uri.toString(),
        skillDescription: plugin.skills[0].description,
        ruleUri: plugin.instructions[0].uri.toString(),
        ruleDescription: plugin.instructions[0].description
      },
      {
        agentUri: agent.toString(),
        agentDescription: "Agent description",
        skillUri: skill.toString(),
        skillDescription: "Skill description",
        ruleUri: instruction.toString(),
        ruleDescription: "Rule description"
      }
    );
  });
  test("does not include parsed agent-instruction rules in mapToParsedPlugin output", async () => {
    await seed("/workspace/.github/copilot-instructions.md", "workspace instructions");
    await seed("/workspace/.agents/skills/bar/SKILL.md", "---\nname: bar\ndescription: Skill description\n---\nbody");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);
    const plugin = mapToParsedPlugin(customizations);
    assert.ok(plugin);
    assert.strictEqual(plugin.skills.length, 1);
    assert.strictEqual(plugin.instructions.length, 0);
  });
  test("returns undefined from mapToParsedPlugin when all customizations are agent-instruction files", async () => {
    await seed("/workspace/.github/copilot-instructions.md", "workspace instructions");
    await seed("/home/.copilot/copilot-instructions.md", "user instructions");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);
    const plugin = mapToParsedPlugin(customizations);
    assert.strictEqual(plugin, void 0);
  });
  test("scan discovers agent instruction files across every working directory", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    const first = await seed("/workspace/.github/copilot-instructions.md", "first");
    const second = await seed("/workspace2/.github/copilot-instructions.md", "second");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).filter((directory) => directory.type === DiscoveredType.AgentInstruction).flatMap((directory) => directory.files.map((file) => file.uri.toString())).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(files, [first.toString(), second.toString()].sort((a, b) => a.localeCompare(b)));
  });
  test("constructor rejects an empty working-directory set (non-empty, primary-first invariant)", () => {
    assert.throws(
      () => instantiationService.createInstance(SessionCustomizationDiscovery, [], userHome, URI.file),
      /at least one working directory/
    );
  });
  test("scan discovers hooks from the primary working directory only", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    const primaryHook = await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace2/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, URI.file));
    const hookFiles = (await discovery.scan(CancellationToken.None)).filter((directory) => directory.type === DiscoveredType.Hook).flatMap((directory) => directory.files.map((file) => file.uri.toString())).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(hookFiles, [primaryHook.toString()]);
  });
  test("discover includes hooks from the primary working directory only", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace2/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
        instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
        skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) }
      }
    };
    const hookChildren = (await discovery.discover(client, CancellationToken.None)).filter((customization) => customization.contents === "hook").flatMap((customization) => (customization.children ?? []).map((child) => URI.parse(child.uri).path)).sort();
    assert.deepStrictEqual(hookChildren, ["/workspace/.github/hooks/pre-tool.json"]);
  });
  test("discover resolves relative instructions against their attributed project root and groups per root", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    const firstFile = await seed("/workspace/.github/copilot-instructions.md", "first");
    const secondFile = await seed("/workspace2/.github/copilot-instructions.md", "second");
    let requestedProjectPaths;
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
        instructions: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/copilot-instructions.md", kind: "file" },
              { path: "/workspace2/.github/copilot-instructions.md", kind: "file" }
            ]
          }),
          discover: async (request) => {
            requestedProjectPaths = request.projectPaths;
            return {
              sources: [
                { id: "a", label: "A", sourcePath: ".github/copilot-instructions.md", applyTo: void 0, type: "repo", projectPath: workspace.fsPath },
                { id: "b", label: "B", sourcePath: ".github/copilot-instructions.md", applyTo: void 0, type: "repo", projectPath: secondWorkspace.fsPath }
              ]
            };
          }
        },
        skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const ruleDirectories = customizations.filter((customization) => customization.contents === "rule").map((customization) => ({
      uri: customization.uri,
      children: (customization.children ?? []).map((child) => child.uri).sort()
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual({ requestedProjectPaths, ruleDirectories }, {
      requestedProjectPaths: [workspace.fsPath, secondWorkspace.fsPath],
      ruleDirectories: [
        { uri: workspace.toString(), children: [firstFile.toString()] },
        { uri: secondWorkspace.toString(), children: [secondFile.toString()] }
      ].sort((a, b) => a.uri.localeCompare(b.uri))
    });
  });
  test("discover surfaces agents and skills from every working directory in one call", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    let agentProjectPaths;
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async (request) => {
            agentProjectPaths = request.projectPaths;
            return {
              agents: [
                { id: "one", name: "One", description: "", path: "/workspace/.github/agents/one.agent.md", userInvocable: false },
                { id: "two", name: "Two", description: "", path: "/workspace2/.github/agents/two.agent.md", userInvocable: false }
              ]
            };
          }
        },
        instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({
            skills: [
              { path: "/workspace/.github/skills/a", name: "A", description: "" },
              { path: "/workspace2/.github/skills/b", name: "B", description: "" }
            ]
          })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const childUris = customizations.flatMap((customization) => (customization.children ?? []).map((child) => URI.parse(child.uri).path)).sort();
    assert.deepStrictEqual({ agentProjectPaths, childUris }, {
      agentProjectPaths: [workspace.fsPath, secondWorkspace.fsPath],
      childUris: [
        "/workspace/.github/agents/one.agent.md",
        "/workspace/.github/skills/a",
        "/workspace2/.github/agents/two.agent.md",
        "/workspace2/.github/skills/b"
      ]
    });
  });
});
suite("SessionPluginBundler", () => {
  const disposables = new DisposableStore();
  let fileService;
  let instantiationService;
  let workspace;
  let userHome;
  let pluginBasePath;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const memFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
    userHome = URI.from({ scheme: Schemas.inMemory, path: "/home" });
    pluginBasePath = URI.from({ scheme: Schemas.inMemory, path: "/agentPlugins" });
    instantiationService.stub(IAgentPluginManager, { basePath: pluginBasePath });
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function seed(path, content = "") {
    const uri = URI.from({ scheme: Schemas.inMemory, path });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
    return uri;
  }
  test("bundles discovered files into the synthetic plugin tree", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    await seed("/workspace/.github/instructions/baz.instructions.md", "instr body");
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    const directories = await discovery.scan(CancellationToken.None);
    const result = await bundler.bundle(directories);
    assert.ok(result);
    assert.strictEqual(result.ref.name, "VS Code Synced Data");
    assert.ok(result.ref.nonce);
    const root = bundler.rootUri;
    const manifest = await fileService.readFile(URI.joinPath(root, ".plugin", "plugin.json"));
    assert.match(manifest.value.toString(), /"name": "VS Code Synced Data"/);
    const agent = await fileService.readFile(URI.joinPath(root, "agents", "foo.agent.md"));
    assert.strictEqual(agent.value.toString(), "agent body");
    const skill = await fileService.readFile(URI.joinPath(root, "skills", "bar", "SKILL.md"));
    assert.strictEqual(skill.value.toString(), "skill body");
    const instr = await fileService.readFile(URI.joinPath(root, "rules", "baz.instructions.md"));
    assert.strictEqual(instr.value.toString(), "instr body");
    const hook = await fileService.readFile(URI.joinPath(root, "hooks", "pre-tool.json"));
    assert.strictEqual(hook.value.toString(), '{"PreToolUse": []}');
  });
  test("produces a stable nonce for identical content", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    const first = await bundler.bundle(await discovery.scan(CancellationToken.None));
    let writeCalls = 0;
    let deleteCalls = 0;
    const originalWriteFile = fileService.writeFile.bind(fileService);
    const originalDel = fileService.del.bind(fileService);
    disposables.add({
      dispose: () => {
        fileService.writeFile = originalWriteFile;
        fileService.del = originalDel;
      }
    });
    fileService.writeFile = ((...args) => {
      writeCalls++;
      return originalWriteFile(...args);
    });
    fileService.del = ((...args) => {
      deleteCalls++;
      return originalDel(...args);
    });
    const second = await bundler.bundle(await discovery.scan(CancellationToken.None));
    assert.ok(first);
    assert.ok(second);
    assert.deepStrictEqual({
      firstNonce: first.ref.nonce,
      secondNonce: second.ref.nonce,
      writeCalls,
      deleteCalls
    }, {
      firstNonce: first.ref.nonce,
      secondNonce: first.ref.nonce,
      writeCalls: 0,
      deleteCalls: 0
    });
  });
  test("returns undefined without rewriting when cancelled", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    let writeCalls = 0;
    let deleteCalls = 0;
    const originalWriteFile = fileService.writeFile.bind(fileService);
    const originalDel = fileService.del.bind(fileService);
    disposables.add({
      dispose: () => {
        fileService.writeFile = originalWriteFile;
        fileService.del = originalDel;
      }
    });
    fileService.writeFile = ((...args) => {
      writeCalls++;
      return originalWriteFile(...args);
    });
    fileService.del = ((...args) => {
      deleteCalls++;
      return originalDel(...args);
    });
    const result = await bundler.bundle(await discovery.scan(CancellationToken.None), CancellationToken.Cancelled);
    assert.deepStrictEqual({ result, writeCalls, deleteCalls }, { result: void 0, writeCalls: 0, deleteCalls: 0 });
  });
  test("different working directories produce different bundle authorities", async () => {
    const otherWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/other-workspace" });
    const a = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    const b = disposables.add(instantiationService.createInstance(SessionPluginBundler, otherWorkspace));
    assert.notStrictEqual(a.rootUri.toString(), b.rootUri.toString());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvc2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgQ29waWxvdENsaWVudCB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlVGltZW91dCwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpbk1hbmFnZXIgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IERpc2NvdmVyZWRUeXBlLCBTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9zZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50c0Rpc2NvdmVyUmVxdWVzdCB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90UkNQLmpzJztcbmltcG9ydCB7IFNlc3Npb25QbHVnaW5CdW5kbGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvc2Vzc2lvblBsdWdpbkJ1bmRsZXIuanMnO1xuaW1wb3J0IHsgbWFwVG9QYXJzZWRQbHVnaW4sIHRvRGlzY292ZXJlZERpcmVjdG9yeUN1c3RvbWl6YXRpb25zIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2NvcGlsb3RBZ2VudC5qcyc7XG5cbnN1aXRlKCdTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCB3b3Jrc3BhY2U6IFVSSTtcblx0bGV0IHVzZXJIb21lOiBVUkk7XG5cdGxldCBwbHVnaW5CYXNlUGF0aDogVVJJO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBtZW1GcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgbWVtRnMpKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHR3b3Jrc3BhY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UnIH0pO1xuXHRcdHVzZXJIb21lID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvaG9tZScgfSk7XG5cdFx0cGx1Z2luQmFzZVBhdGggPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudFBsdWdpbnMnIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luTWFuYWdlciwgeyBiYXNlUGF0aDogcGx1Z2luQmFzZVBhdGggfSBhcyBQYXJ0aWFsPElBZ2VudFBsdWdpbk1hbmFnZXI+KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRhc3luYyBmdW5jdGlvbiBzZWVkKHBhdGg6IHN0cmluZywgY29udGVudCA9ICcnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aCB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0Ly8gTWlycm9yIGBVUkkuZmlsZWAncyBzZXBhcmF0b3Igbm9ybWFsaXphdGlvbiAoaXQgcmV3cml0ZXMgYFxcYCBcdTIxOTIgYC9gIG9uIFdpbmRvd3MpIHNvIGFcblx0Ly8gcm91bmQtdHJpcCB0aHJvdWdoIGAuZnNQYXRoYCBcdTIwMTQgdXNlZCBieSBgcHJvamVjdFBhdGhgIGF0dHJpYnV0aW9uIGluIGRpc2NvdmVyeSBcdTIwMTQgbWF0Y2hlc1xuXHQvLyBvbiBXaW5kb3dzIHRvbywgd2hlcmUgYFVSSS5mc1BhdGhgIHlpZWxkcyBiYWNrc2xhc2hlcy5cblx0Y29uc3QgaW5NZW1vcnlQYXRoVG9VcmkgPSAocGF0aDogc3RyaW5nKSA9PiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogcGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJykgfSk7XG5cblx0dGVzdCgnZGlzY292ZXJzIHN1cHBvcnRlZCBhZ2VudCBpbnN0cnVjdGlvbiBmaWxlcyBpbiB3b3Jrc3BhY2Ugcm9vdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd3NDb3BpbG90SW5zdHJ1Y3Rpb25zID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBjb3BpbG90IGluc3RydWN0aW9ucycpO1xuXHRcdGNvbnN0IHdzR2VtaW5pSW5zdHJ1Y3Rpb25zID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS9HRU1JTkkubWQnLCAnd29ya3NwYWNlIGdlbWluaSBpbnN0cnVjdGlvbnMnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGZpbGVzID0gKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVxuXHRcdFx0LmZsYXRNYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5maWxlcy5tYXAoZmlsZSA9PiAoeyB1cmk6IGZpbGUudXJpLCB0eXBlOiBkaXJlY3RvcnkudHlwZSB9KSkpXG5cdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb24pXG5cdFx0XHQubWFwKGVudHJ5ID0+IGVudHJ5LnVyaS50b1N0cmluZygpKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVzLCBbXG5cdFx0XHR3c0NvcGlsb3RJbnN0cnVjdGlvbnMudG9TdHJpbmcoKSxcblx0XHRcdHdzR2VtaW5pSW5zdHJ1Y3Rpb25zLnRvU3RyaW5nKCksXG5cdFx0XS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKTtcblx0fSk7XG5cblx0dGVzdCgnZ3JvdXBzIGRpc2NvdmVyZWQgY3VzdG9taXphdGlvbnMgYnkgcGFyZW50IGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgaW5NZW1vcnlQYXRoVG9VcmkpKTtcblx0XHRjb25zdCBjbGllbnQgPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0YWdlbnRzOiB7XG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRhZ2VudHM6IFtcblx0XHRcdFx0XHRcdFx0eyBpZDogJ29uZScsIG5hbWU6ICdPbmUnLCBkZXNjcmlwdGlvbjogJycsIHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL29uZS5hZ2VudC5tZCcsIHVzZXJJbnZvY2FibGU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICd0d28nLCBuYW1lOiAnVHdvJywgZGVzY3JpcHRpb246ICcnLCBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy90d28uYWdlbnQubWQnLCB1c2VySW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICd0aHJlZScsIG5hbWU6ICdUaHJlZScsIGRlc2NyaXB0aW9uOiAnJywgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9vdGhlci90aHJlZS5hZ2VudC5tZCcsIHVzZXJJbnZvY2FibGU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IHsgZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNvdXJjZXM6IFtdIH0pIH0sXG5cdFx0XHRcdHNraWxsczogeyBkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgc2tpbGxzOiBbXSB9KSB9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgQ29waWxvdENsaWVudDtcblxuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgZGlzY292ZXJ5LmRpc2NvdmVyKGNsaWVudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgYWdlbnREaXJlY3RvcmllcyA9IGN1c3RvbWl6YXRpb25zLmZpbHRlcihjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24uY29udGVudHMgPT09ICdhZ2VudCcpO1xuXG5cdFx0Y29uc3QgZ2V0UGF0aCA9ICh1cmk6IHN0cmluZykgPT4gVVJJLnBhcnNlKHVyaSkucGF0aDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudERpcmVjdG9yaWVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudERpcmVjdG9yaWVzLm1hcChjdXN0b21pemF0aW9uID0+IGdldFBhdGgoY3VzdG9taXphdGlvbi51cmkpKS5zb3J0KCksIFtcblx0XHRcdCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzJyxcblx0XHRcdCcvd29ya3NwYWNlLy5naXRodWIvb3RoZXInLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFnZW50c0luQWdlbnRzRGlyID0gYWdlbnREaXJlY3Rvcmllcy5maW5kKGN1c3RvbWl6YXRpb24gPT4gZ2V0UGF0aChjdXN0b21pemF0aW9uLnVyaSkgPT09ICcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzJyk7XG5cdFx0YXNzZXJ0Lm9rKGFnZW50c0luQWdlbnRzRGlyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50c0luQWdlbnRzRGlyLmNoaWxkcmVuPy5tYXAoY2hpbGQgPT4gZ2V0UGF0aChjaGlsZC51cmkpKS5zb3J0KCksIFtcblx0XHRcdCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL29uZS5hZ2VudC5tZCcsXG5cdFx0XHQnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy90d28uYWdlbnQubWQnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlciBpbmNsdWRlcyBob29rcyBmcm9tIHJlY3Vyc2l2ZSBhbmQgZml4ZWQgaG9vayBsb2NhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3ByZS10b29sLmpzb24nLCAne1wiUHJlVG9vbFVzZVwiOiBbXX0nKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC9zZXR0aW5ncy5qc29uJywgJ3tcImhvb2tzXCI6IHtcIlByZVRvb2xVc2VcIjogW119fScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIGluTWVtb3J5UGF0aFRvVXJpKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdGFnZW50czoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IGFnZW50czogW10gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNvdXJjZXM6IFtdIH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRza2lsbHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBza2lsbHM6IFtdIH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgQ29waWxvdENsaWVudDtcblxuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgZGlzY292ZXJ5LmRpc2NvdmVyKGNsaWVudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgaG9va0RpcmVjdG9yaWVzID0gY3VzdG9taXphdGlvbnNcblx0XHRcdC5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLmNvbnRlbnRzID09PSAnaG9vaycpXG5cdFx0XHQubWFwKGN1c3RvbWl6YXRpb24gPT4gKHtcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoY3VzdG9taXphdGlvbi51cmkpLnBhdGgsXG5cdFx0XHRcdGNoaWxkcmVuOiAoY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkubWFwKGNoaWxkID0+IFVSSS5wYXJzZShjaGlsZC51cmkpLnBhdGgpLnNvcnQoKSxcblx0XHRcdH0pKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEudXJpLmxvY2FsZUNvbXBhcmUoYi51cmkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaG9va0RpcmVjdG9yaWVzLCBbXG5cdFx0XHR7IHVyaTogJy9ob21lLy5jb3BpbG90L2hvb2tzJywgY2hpbGRyZW46IFtdIH0sXG5cdFx0XHR7IHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90JywgY2hpbGRyZW46IFsnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3Qvc2V0dGluZ3MuanNvbiddIH0sXG5cdFx0XHR7IHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcycsIGNoaWxkcmVuOiBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJ10gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbWFya3MgYWdlbnQgaW5zdHJ1Y3Rpb24gcnVsZSBzb3VyY2VzIGFzIGFsd2F5cyBhcHBseScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlL0FHRU5UUy5tZCcsICd3b3Jrc3BhY2UgYWdlbnRzIGluc3RydWN0aW9ucycpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvcnVsZS5pbnN0cnVjdGlvbnMubWQnLCAnc2NvcGVkIGluc3RydWN0aW9uJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgaW5NZW1vcnlQYXRoVG9VcmkpKTtcblx0XHRjb25zdCBjbGllbnQgPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0YWdlbnRzOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgYWdlbnRzOiBbXSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRwYXRoczogW1xuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zJywga2luZDogJ2RpcmVjdG9yeScgfSxcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCBraW5kOiAnZmlsZScgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRzb3VyY2VzOiBbXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICdhZ2VudEluc3RydWN0aW9uJywgbGFiZWw6ICdBR0VOVFMubWQnLCBzb3VyY2VQYXRoOiAnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCBhcHBseVRvOiBbXSwgdHlwZTogJ3JlcG8nIH0sXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICdzY29wZWRJbnN0cnVjdGlvbicsIGxhYmVsOiAnUnVsZScsIHNvdXJjZVBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3J1bGUuaW5zdHJ1Y3Rpb25zLm1kJywgYXBwbHlUbzogWydzcmMvKionXSwgdHlwZTogJ2NoaWxkLWluc3RydWN0aW9ucycgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNraWxsczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNraWxsczogW10gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90Q2xpZW50O1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCBkaXNjb3ZlcnkuZGlzY292ZXIoY2xpZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBydWxlcyA9IGN1c3RvbWl6YXRpb25zXG5cdFx0XHQuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5jb250ZW50cyA9PT0gJ3J1bGUnKVxuXHRcdFx0LmZsYXRNYXAoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLmNoaWxkcmVuID8/IFtdKVxuXHRcdFx0Lm1hcChjaGlsZCA9PiAoe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShjaGlsZC51cmkpLnBhdGgsXG5cdFx0XHRcdGFsd2F5c0FwcGx5OiBjaGlsZC50eXBlID09PSAncnVsZScgPyBjaGlsZC5hbHdheXNBcHBseSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEudXJpLmxvY2FsZUNvbXBhcmUoYi51cmkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVsZXMsIFtcblx0XHRcdHsgdXJpOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9ydWxlLmluc3RydWN0aW9ucy5tZCcsIGFsd2F5c0FwcGx5OiBmYWxzZSB9LFxuXHRcdFx0eyB1cmk6ICcvd29ya3NwYWNlL0FHRU5UUy5tZCcsIGFsd2F5c0FwcGx5OiB0cnVlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Ryb3BzIG1pc3NpbmcgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgYW5kIGVtcHR5IGFnZW50IGluc3RydWN0aW9uIGRpcmVjdG9yaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvcnVsZS5pbnN0cnVjdGlvbnMubWQnLCAnc2NvcGVkIGluc3RydWN0aW9uJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgaW5NZW1vcnlQYXRoVG9VcmkpKTtcblx0XHRjb25zdCBjbGllbnQgPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0YWdlbnRzOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgYWdlbnRzOiBbXSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRwYXRoczogW1xuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zJywga2luZDogJ2RpcmVjdG9yeScgfSxcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCBraW5kOiAnZmlsZScgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRzb3VyY2VzOiBbXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICdhZ2VudEluc3RydWN0aW9uJywgbGFiZWw6ICdBR0VOVFMubWQnLCBzb3VyY2VQYXRoOiAnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCBhcHBseVRvOiBbXSwgdHlwZTogJ3JlcG8nIH0sXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICdzY29wZWRJbnN0cnVjdGlvbicsIGxhYmVsOiAnUnVsZScsIHNvdXJjZVBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3J1bGUuaW5zdHJ1Y3Rpb25zLm1kJywgYXBwbHlUbzogWydzcmMvKionXSwgdHlwZTogJ2NoaWxkLWluc3RydWN0aW9ucycgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNraWxsczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNraWxsczogW10gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90Q2xpZW50O1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCBkaXNjb3ZlcnkuZGlzY292ZXIoY2xpZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBydWxlRGlyZWN0b3JpZXMgPSBjdXN0b21pemF0aW9uc1xuXHRcdFx0LmZpbHRlcihjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24uY29udGVudHMgPT09ICdydWxlJylcblx0XHRcdC5tYXAoY3VzdG9taXphdGlvbiA9PiAoe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShjdXN0b21pemF0aW9uLnVyaSkucGF0aCxcblx0XHRcdFx0Y2hpbGRyZW46IChjdXN0b21pemF0aW9uLmNoaWxkcmVuID8/IFtdKS5tYXAoY2hpbGQgPT4gVVJJLnBhcnNlKGNoaWxkLnVyaSkucGF0aCkuc29ydCgpLFxuXHRcdFx0fSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYS51cmkubG9jYWxlQ29tcGFyZShiLnVyaSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChydWxlRGlyZWN0b3JpZXMsIFtcblx0XHRcdHsgdXJpOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucycsIGNoaWxkcmVuOiBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvcnVsZS5pbnN0cnVjdGlvbnMubWQnXSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlciByZXR1cm5zIHdvcmtpbmctZGlyZWN0b3J5IGFnZW50cywgc2tpbGxzLCBpbnN0cnVjdGlvbnMsIGhvb2tzLCBhbmQgYWdlbnQgaW5zdHJ1Y3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgJ2FnZW50IGJvZHknKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2Jhci9TS0lMTC5tZCcsICdza2lsbCBib2R5Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9iYXouaW5zdHJ1Y3Rpb25zLm1kJywgJ2luc3RydWN0aW9uIGJvZHknKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbicsICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90L3NldHRpbmdzLmpzb24nLCAne1wiaG9va3NcIjoge1wiUHJlVG9vbFVzZVwiOiBbXX19Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBjb3BpbG90IGluc3RydWN0aW9ucycpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvQUdFTlRTLm1kJywgJ3dvcmtzcGFjZSBhZ2VudHMgaW5zdHJ1Y3Rpb25zJyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3QvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAndXNlciBjb3BpbG90IGluc3RydWN0aW9ucycpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIGluTWVtb3J5UGF0aFRvVXJpKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdGFnZW50czoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW3sgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMnIH1dIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0YWdlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICdhZ2VudCcsIG5hbWU6ICdBZ2VudCcsIGRlc2NyaXB0aW9uOiAnYWdlbnQgZGVzY3JpcHRpb24nLCBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCB1c2VySW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRcdHBhdGhzOiBbXG5cdFx0XHRcdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMnLCBraW5kOiAnZGlyZWN0b3J5JyB9LFxuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCBraW5kOiAnZmlsZScgfSxcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCBraW5kOiAnZmlsZScgfSxcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL2hvbWUvLmNvcGlsb3QvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCBraW5kOiAnZmlsZScgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRzb3VyY2VzOiBbXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICdydWxlJywgbGFiZWw6ICdSdWxlJywgZGVzY3JpcHRpb246ICdydWxlIGRlc2NyaXB0aW9uJywgc291cmNlUGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYmF6Lmluc3RydWN0aW9ucy5tZCcsIGFwcGx5VG86IFtdIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRza2lsbHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFt7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJyB9XSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRcdHNraWxsczogW1xuXHRcdFx0XHRcdFx0XHR7IG5hbWU6ICdTa2lsbCcsIGRlc2NyaXB0aW9uOiAnc2tpbGwgZGVzY3JpcHRpb24nLCBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9iYXIvU0tJTEwubWQnIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgQ29waWxvdENsaWVudDtcblxuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgZGlzY292ZXJ5LmRpc2NvdmVyKGNsaWVudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgZGlyZWN0b3JpZXMgPSBjdXN0b21pemF0aW9uc1xuXHRcdFx0Lm1hcChjdXN0b21pemF0aW9uID0+ICh7XG5cdFx0XHRcdGNvbnRlbnRzOiBjdXN0b21pemF0aW9uLmNvbnRlbnRzLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShjdXN0b21pemF0aW9uLnVyaSkucGF0aCxcblx0XHRcdFx0d3JpdGFibGU6IGN1c3RvbWl6YXRpb24ud3JpdGFibGUsXG5cdFx0XHRcdGNoaWxkcmVuOiAoY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkubWFwKGNoaWxkID0+IFVSSS5wYXJzZShjaGlsZC51cmkpLnBhdGgpLnNvcnQoKSxcblx0XHRcdH0pKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEudXJpLmxvY2FsZUNvbXBhcmUoYi51cmkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlyZWN0b3JpZXMsIFtcblx0XHRcdHsgY29udGVudHM6ICdydWxlJywgdXJpOiAnL2hvbWUnLCB3cml0YWJsZTogZmFsc2UsIGNoaWxkcmVuOiBbJy9ob21lLy5jb3BpbG90L2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJ10gfSxcblx0XHRcdHsgY29udGVudHM6ICdob29rJywgdXJpOiAnL2hvbWUvLmNvcGlsb3QvaG9va3MnLCB3cml0YWJsZTogdHJ1ZSwgY2hpbGRyZW46IFtdIH0sXG5cdFx0XHR7IGNvbnRlbnRzOiAncnVsZScsIHVyaTogJy93b3Jrc3BhY2UnLCB3cml0YWJsZTogZmFsc2UsIGNoaWxkcmVuOiBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICcvd29ya3NwYWNlL0FHRU5UUy5tZCddIH0sXG5cdFx0XHR7IGNvbnRlbnRzOiAnYWdlbnQnLCB1cmk6ICcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzJywgd3JpdGFibGU6IHRydWUsIGNoaWxkcmVuOiBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJ10gfSxcblx0XHRcdHsgY29udGVudHM6ICdob29rJywgdXJpOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QnLCB3cml0YWJsZTogdHJ1ZSwgY2hpbGRyZW46IFsnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3Qvc2V0dGluZ3MuanNvbiddIH0sXG5cdFx0XHR7IGNvbnRlbnRzOiAnaG9vaycsIHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcycsIHdyaXRhYmxlOiB0cnVlLCBjaGlsZHJlbjogWycvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbiddIH0sXG5cdFx0XHR7IGNvbnRlbnRzOiAncnVsZScsIHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMnLCB3cml0YWJsZTogdHJ1ZSwgY2hpbGRyZW46IFsnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9iYXouaW5zdHJ1Y3Rpb25zLm1kJ10gfSxcblx0XHRcdHsgY29udGVudHM6ICdza2lsbCcsIHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMnLCB3cml0YWJsZTogdHJ1ZSwgY2hpbGRyZW46IFsnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9iYXIvU0tJTEwubWQnXSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlciBncm91cHMgY2FzZS12YXJpYW50IGluc3RydWN0aW9ucyBhbmQgbmVzdGVkIHNraWxscyB1bmRlciB0aGVpciByb290cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYXNlVmFyaWFudFVzZXJIb21lID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvSE9NRScgfSk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3QvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAndXNlciBjb3BpbG90IGluc3RydWN0aW9ucycpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJywgJ3NraWxsIGJvZHknKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIGNhc2VWYXJpYW50VXNlckhvbWUsIGluTWVtb3J5UGF0aFRvVXJpKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdGFnZW50czoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IGFnZW50czogW10gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW3sgcGF0aDogJy9ob21lLy5jb3BpbG90L2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywga2luZDogJ2ZpbGUnIH1dIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBzb3VyY2VzOiBbeyBpZDogJ3VzZXJJbnN0cnVjdGlvbicsIGxhYmVsOiAnVXNlciBpbnN0cnVjdGlvbicsIHNvdXJjZVBhdGg6ICcvaG9tZS8uY29waWxvdC9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsIHR5cGU6ICdob21lJyB9XSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c2tpbGxzOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRwYXRoczogW1xuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJyB9LFxuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2JhcicgfSxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgc2tpbGxzOiBbeyBuYW1lOiAnU2tpbGwnLCBkZXNjcmlwdGlvbjogJ3NraWxsIGRlc2NyaXB0aW9uJywgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJyB9XSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RDbGllbnQ7XG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IGRpc2NvdmVyeS5kaXNjb3ZlcihjbGllbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGRpcmVjdG9yaWVzID0gY3VzdG9taXphdGlvbnNcblx0XHRcdC5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLmNvbnRlbnRzID09PSAncnVsZScgfHwgY3VzdG9taXphdGlvbi5jb250ZW50cyA9PT0gJ3NraWxsJylcblx0XHRcdC5tYXAoY3VzdG9taXphdGlvbiA9PiAoe1xuXHRcdFx0XHRjb250ZW50czogY3VzdG9taXphdGlvbi5jb250ZW50cyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoY3VzdG9taXphdGlvbi51cmkpLnBhdGgsXG5cdFx0XHRcdGNoaWxkcmVuOiAoY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkubWFwKGNoaWxkID0+IFVSSS5wYXJzZShjaGlsZC51cmkpLnBhdGgpLFxuXHRcdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXJlY3RvcmllcywgW1xuXHRcdFx0eyBjb250ZW50czogJ3J1bGUnLCB1cmk6ICcvSE9NRScsIGNoaWxkcmVuOiBbJy9ob21lLy5jb3BpbG90L2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJ10gfSxcblx0XHRcdHsgY29udGVudHM6ICdza2lsbCcsIHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMnLCBjaGlsZHJlbjogWycvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2Jhci9TS0lMTC5tZCddIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZGlyZWN0b3JpZXMgc29ydGVkIGJ5IHR5cGUgYW5kIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2FhYS5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQgYScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgJ3dvcmtzcGFjZSBhZ2VudCcpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYWxwaGEvU0tJTEwubWQnLCAnd29ya3NwYWNlIHNraWxsIGFscGhhJyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9iYXIvU0tJTEwubWQnLCAnd29ya3NwYWNlIHNraWxsJyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9hbHBoYS5pbnN0cnVjdGlvbnMubWQnLCAnd29ya3NwYWNlIGluc3RydWN0aW9uIGFscGhhJyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9iYXouaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBpbnN0cnVjdGlvbicpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgY29waWxvdCBpbnN0cnVjdGlvbnMnKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9hZ2VudHMvYWJjLmFnZW50Lm1kJywgJ3VzZXIgYWdlbnQgYWJjJyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3QvYWdlbnRzL3F1eC5hZ2VudC5tZCcsICd1c2VyIGFnZW50Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3Qvc2tpbGxzL2FscGhhL1NLSUxMLm1kJywgJ3VzZXIgY29waWxvdCBza2lsbCcpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5hZ2VudHMvc2tpbGxzL2FhYS9TS0lMTC5tZCcsICd1c2VyIHNraWxsIGFhYScpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5hZ2VudHMvc2tpbGxzL3phcC9TS0lMTC5tZCcsICd1c2VyIHNraWxsJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBkaXJlY3RvcmllcyA9IGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGRpcmVjdG9yaWVzLm1hcChkaXJlY3RvcnkgPT4gYCR7ZGlyZWN0b3J5LnR5cGV9OiR7ZGlyZWN0b3J5LnVyaS50b1N0cmluZygpfWApO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gWy4uLmFjdHVhbF0uc29ydCgoYSwgYikgPT4gYSA8IGIgPyAtMSA6IGEgPiBiID8gMSA6IDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHRmb3IgKGNvbnN0IGRpcmVjdG9yeSBvZiBkaXJlY3Rvcmllcykge1xuXHRcdFx0Y29uc3QgYWN0dWFsRmlsZXMgPSBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gZmlsZS51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZEZpbGVzID0gWy4uLmFjdHVhbEZpbGVzXS5zb3J0KChhLCBiKSA9PiBhIDwgYiA/IC0xIDogYSA+IGIgPyAxIDogMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbEZpbGVzLCBleHBlY3RlZEZpbGVzKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGRpc2NvdmVyIGFnZW50IGluc3RydWN0aW9uIGZpbGVzIG91dHNpZGUgc3VwcG9ydGVkIHJvb3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgY29waWxvdCBpbnN0cnVjdGlvbnMnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlL2RvY3MvQUdFTlRTLm1kJywgJ3Vuc3VwcG9ydGVkIHJvb3QnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5jbGF1ZGUvR0VNSU5JLm1kJywgJ3Vuc3VwcG9ydGVkIGZpbGVuYW1lIGluIC5jbGF1ZGUnKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICd1bnN1cHBvcnRlZCBob21lIHJvb3QnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGZpbGVzID0gKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVxuXHRcdFx0LmZsYXRNYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5maWxlcy5tYXAoZmlsZSA9PiAoeyB1cmk6IGZpbGUudXJpLCB0eXBlOiBkaXJlY3RvcnkudHlwZSB9KSkpXG5cdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb24pXG5cdFx0XHQubWFwKGVudHJ5ID0+IGVudHJ5LnVyaS50b1N0cmluZygpKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVzLCBbXG5cdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcgfSkudG9TdHJpbmcoKSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zdGFsbHMgd2F0Y2hlcnMgZm9yIHJvb3RzIHRoYXQgY29udGFpbiBkaXNjb3ZlcmVkIGN1c3RvbWl6YXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgJ3dvcmtzcGFjZSBhZ2VudCcpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJywgJ3dvcmtzcGFjZSBza2lsbCcpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvcnVsZXMuaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBpbnN0cnVjdGlvbicpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJywgJ3tcIlByZVRvb2xVc2VcIjogW119Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBjb3BpbG90IGluc3RydWN0aW9ucycpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmNsYXVkZS9DTEFVREUubWQnLCAnd29ya3NwYWNlIGNsYXVkZSBpbnN0cnVjdGlvbicpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2FnZW50cy91c2VyLmFnZW50Lm1kJywgJ3VzZXIgYWdlbnQnKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9za2lsbHMvY29waWxvdC11c2VyLXNraWxsL1NLSUxMLm1kJywgJ3VzZXIgY29waWxvdCBza2lsbCcpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5hZ2VudHMvc2tpbGxzL3VzZXItc2tpbGwvU0tJTEwubWQnLCAndXNlciBza2lsbCcpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2luc3RydWN0aW9ucy91c2VyLmluc3RydWN0aW9ucy5tZCcsICd1c2VyIGluc3RydWN0aW9uJyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3QvaG9va3MvcG9zdC10b29sLmpzb24nLCAne1wiUG9zdFRvb2xVc2VcIjogW119Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3QvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAndXNlciBjb3BpbG90IGluc3RydWN0aW9ucycpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hDYWxsczogQXJyYXk8eyByZXNvdXJjZTogc3RyaW5nOyByZWN1cnNpdmU6IGJvb2xlYW4gfT4gPSBbXTtcblx0XHRjb25zdCBvcmlnaW5hbFdhdGNoID0gZmlsZVNlcnZpY2Uud2F0Y2guYmluZChmaWxlU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4geyBmaWxlU2VydmljZS53YXRjaCA9IG9yaWdpbmFsV2F0Y2ggYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLndhdGNoOyB9IH0pO1xuXHRcdGZpbGVTZXJ2aWNlLndhdGNoID0gKChyZXNvdXJjZSwgb3B0aW9ucykgPT4ge1xuXHRcdFx0d2F0Y2hDYWxscy5wdXNoKHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIHJlY3Vyc2l2ZTogb3B0aW9ucz8ucmVjdXJzaXZlID09PSB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsV2F0Y2gocmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdH0pIGFzIHR5cGVvZiBmaWxlU2VydmljZS53YXRjaDtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hlZCA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuXHRcdGZvciAoY29uc3QgY2FsbCBvZiB3YXRjaENhbGxzKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91cyA9IHdhdGNoZWQuZ2V0KGNhbGwucmVzb3VyY2UpO1xuXHRcdFx0d2F0Y2hlZC5zZXQoY2FsbC5yZXNvdXJjZSwgcHJldmlvdXMgPT09IHRydWUgfHwgY2FsbC5yZWN1cnNpdmUpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQod29ya3NwYWNlLnRvU3RyaW5nKCkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJykudG9TdHJpbmcoKSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5jbGF1ZGUnKS50b1N0cmluZygpKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVkLmdldChVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdhZ2VudHMnKS50b1N0cmluZygpKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVkLmdldChVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdza2lsbHMnKS50b1N0cmluZygpKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2luc3RydWN0aW9ucycpLnRvU3RyaW5nKCkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnaG9va3MnKS50b1N0cmluZygpKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KFVSSS5qb2luUGF0aCh1c2VySG9tZSwgJy5jb3BpbG90JykudG9TdHJpbmcoKSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHVzZXJIb21lLCAnLmNvcGlsb3QnLCAnYWdlbnRzJykudG9TdHJpbmcoKSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHVzZXJIb21lLCAnLmNvcGlsb3QnLCAnc2tpbGxzJykudG9TdHJpbmcoKSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVkLmdldChVUkkuam9pblBhdGgodXNlckhvbWUsICcuYWdlbnRzJywgJ3NraWxscycpLnRvU3RyaW5nKCkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHVzZXJIb21lLCAnLmNvcGlsb3QnLCAnaW5zdHJ1Y3Rpb25zJykudG9TdHJpbmcoKSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVkLmdldChVUkkuam9pblBhdGgodXNlckhvbWUsICcuY29waWxvdCcsICdob29rcycpLnRvU3RyaW5nKCkpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBrZWVwcyBleGlzdGluZyB3YXRjaGVycyB3aGVuIGRpc2NvdmVyZWQgcm9vdHMgYXJlIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQnKTtcblxuXHRcdGNvbnN0IHdhdGNoQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IHdhdGNoRGlzcG9zZUNhbGxzID0gMDtcblx0XHRjb25zdCBvcmlnaW5hbFdhdGNoID0gZmlsZVNlcnZpY2Uud2F0Y2guYmluZChmaWxlU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4geyBmaWxlU2VydmljZS53YXRjaCA9IG9yaWdpbmFsV2F0Y2ggYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLndhdGNoOyB9IH0pO1xuXHRcdGZpbGVTZXJ2aWNlLndhdGNoID0gKChyZXNvdXJjZSwgb3B0aW9ucykgPT4ge1xuXHRcdFx0d2F0Y2hDYWxscy5wdXNoKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG9yaWdpbmFsV2F0Y2gocmVzb3VyY2UsIG9wdGlvbnMpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRcdHdhdGNoRGlzcG9zZUNhbGxzKys7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSkgYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLndhdGNoO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3Qgd2F0Y2hDYWxsc0FmdGVyRmlyc3RTY2FuID0gd2F0Y2hDYWxscy5sZW5ndGg7XG5cblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaENhbGxzLmxlbmd0aCwgd2F0Y2hDYWxsc0FmdGVyRmlyc3RTY2FuLCAnZXhwZWN0ZWQgbm8gbmV3IHdhdGNoIHJlZ2lzdHJhdGlvbnMgZm9yIHVuY2hhbmdlZCByb290cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaERpc3Bvc2VDYWxscywgMCwgJ2V4cGVjdGVkIGV4aXN0aW5nIHdhdGNoZXJzIHRvIHJlbWFpbiBhY3RpdmUgZm9yIHVuY2hhbmdlZCByb290cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZSB3aGVuIGEgbmV3IGFnZW50IGZpbGUgaXMgYWRkZWQgdW5kZXIgYSBub24tcmVjdXJzaXZlbHkgd2F0Y2hlZCByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNlZWQgYW4gZXhpc3RpbmcgYWdlbnQgc28gYC5naXRodWIvYWdlbnRzYCBpcyBkaXNjb3ZlcmVkIGFuZCB3YXRjaGVkLlxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgJ3dvcmtzcGFjZSBhZ2VudCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBGbHVzaCBidWZmZXJlZCBmaWxlIGNoYW5nZSBldmVudHMgZnJvbSB0aGUgaW5pdGlhbCBzZWVkL3NjYW4gc28gdGhlXG5cdFx0Ly8gYXNzZXJ0aW9uIGJlbG93IG9ubHkgb2JzZXJ2ZXMgdGhlIGV2ZW50IHRyaWdnZXJlZCBieSB0aGUgbmV3IGZpbGUuXG5cdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGNvbnN0IGZpcmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaXNjb3Zlcnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y2hhbmdlQ291bnQrKztcblx0XHRcdGZpcmVkLmNvbXBsZXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9iYXIuYWdlbnQubWQnLCAnbmV3IHdvcmtzcGFjZSBhZ2VudCcpO1xuXHRcdGF3YWl0IHJhY2VUaW1lb3V0KGZpcmVkLnAsIDUwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlQ291bnQsIDEsICdleHBlY3RlZCBvbkRpZENoYW5nZSB0byBmaXJlIGZvciBhIG5ldyBhZ2VudCBmaWxlIGluc2lkZSB0aGUgd2F0Y2hlZCBkaXJlY3RvcnknKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2Ugd2hlbiBhbiBleGlzdGluZyBhZ2VudCBmaWxlIGlzIG1vZGlmaWVkIHVuZGVyIGEgbm9uLXJlY3Vyc2l2ZWx5IHdhdGNoZWQgcm9vdCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRjb25zdCBmaXJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzY292ZXJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNoYW5nZUNvdW50Kys7XG5cdFx0XHRmaXJlZC5jb21wbGV0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIE92ZXJ3cml0ZSB0aGUgZXhpc3RpbmcgYWdlbnQgZmlsZSB0byBwcm9kdWNlIGFuIFVQREFURUQgZXZlbnQuXG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnd29ya3NwYWNlIGFnZW50ICh1cGRhdGVkKScpO1xuXHRcdGF3YWl0IHJhY2VUaW1lb3V0KGZpcmVkLnAsIDUwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlQ291bnQsIDEsICdleHBlY3RlZCBvbkRpZENoYW5nZSB0byBmaXJlIHdoZW4gYW4gZXhpc3RpbmcgYWdlbnQgZmlsZSBpcyBtb2RpZmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZSB3aGVuIGFuIGV4aXN0aW5nIGFnZW50IGZpbGUgaXMgZGVsZXRlZCB1bmRlciBhIG5vbi1yZWN1cnNpdmVseSB3YXRjaGVkIHJvb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQnKTtcblx0XHQvLyBTZWVkIGEgc2Vjb25kIGFnZW50IHNvIHRoZSBwYXJlbnQgZGlyZWN0b3J5IHN0aWxsIGV4aXN0cyBhZnRlciB0aGUgZGVsZXRpb24uXG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9iYXIuYWdlbnQubWQnLCAnd29ya3NwYWNlIGFnZW50IGJhcicpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGNvbnN0IGZpcmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaXNjb3Zlcnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y2hhbmdlQ291bnQrKztcblx0XHRcdGZpcmVkLmNvbXBsZXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuZGVsKGFnZW50VXJpKTtcblx0XHRhd2FpdCByYWNlVGltZW91dChmaXJlZC5wLCA1MDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2UgdG8gZmlyZSB3aGVuIGFuIGV4aXN0aW5nIGFnZW50IGZpbGUgaXMgZGVsZXRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZSB3aGVuIEFHRU5UUy5tZCBpbiB0aGUgd29ya3NwYWNlIHJvb3QgaXMgbW9kaWZpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQUdFTlRTLm1kIGxpdmVzIGRpcmVjdGx5IHVuZGVyIHRoZSB3b3Jrc3BhY2Ugcm9vdCwgd2hpY2ggaXMgd2F0Y2hlZCBub24tcmVjdXJzaXZlbHkuXG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCAnYWdlbnRzIGluc3RydWN0aW9ucycpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cblx0XHRsZXQgY2hhbmdlQ291bnQgPSAwO1xuXHRcdGNvbnN0IGZpcmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaXNjb3Zlcnkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y2hhbmdlQ291bnQrKztcblx0XHRcdGZpcmVkLmNvbXBsZXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCAnYWdlbnRzIGluc3RydWN0aW9ucyAodXBkYXRlZCknKTtcblx0XHRhd2FpdCByYWNlVGltZW91dChmaXJlZC5wLCA1MDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2UgdG8gZmlyZSB3aGVuIEFHRU5UUy5tZCBhdCB0aGUgd29ya3NwYWNlIHJvb3QgaXMgbW9kaWZpZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZmlyZSBvbkRpZENoYW5nZSBmb3IgZmlsZXMgb3V0c2lkZSBhbnkgdHJpZ2dlciBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2VlZCBhIGN1c3RvbWl6YXRpb24gc28gdGhlIHdvcmtzcGFjZSArIGAuZ2l0aHViYCBkaXJzIGdldCB3YXRjaGVycy5cblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzY292ZXJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNoYW5nZUNvdW50Kys7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTm9uZSBvZiB0aGVzZSBwYXRocyBpbnRlcnNlY3QgYW55IHRyaWdnZXIgVVJJOlxuXHRcdC8vICAtIGAuZ2l0L0hFQURgICAgICAgICAgICAgIDogYC5naXRgIGlzIHVucmVsYXRlZCAobm90IGAuZ2l0aHViYClcblx0XHQvLyAgLSBgLnZzY29kZS9zZXR0aW5ncy5qc29uYCA6IGAudnNjb2RlYCBpcyB1bnJlbGF0ZWRcblx0XHQvLyAgLSBgUkVBRE1FLm1kYCAgICAgICAgICAgICA6IGF0IHdvcmtzcGFjZSByb290IGJ1dCBub3QgQUdFTlRTLm1kL0NMQVVERS5tZC9HRU1JTkkubWRcblx0XHQvLyAgLSBgc3JjL2luZGV4LnRzYCAgICAgICAgICA6IHVucmVsYXRlZCB0b3AtbGV2ZWwgZGlyZWN0b3J5XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0L0hFQUQnLCAncmVmOiByZWZzL2hlYWRzL21haW4nKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy52c2NvZGUvc2V0dGluZ3MuanNvbicsICd7fScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvUkVBRE1FLm1kJywgJyMgcHJvamVjdCcpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2Uvc3JjL2luZGV4LnRzJywgJ2V4cG9ydCB7fTsnKTtcblxuXHRcdC8vIEdpdmUgdGhlIGluLW1lbW9yeSBwcm92aWRlciB0aW1lIHRvIGRlbGl2ZXIgYW55IChzdHJheSkgZXZlbnRzLlxuXHRcdGF3YWl0IHRpbWVvdXQoMTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VDb3VudCwgMCwgJ2V4cGVjdGVkIG9uRGlkQ2hhbmdlIG5vdCB0byBmaXJlIGZvciBwYXRocyBvdXRzaWRlIGFueSB0cmlnZ2VyIFVSSScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlciBtb2RlIHdhdGNoZXMgdGhlIGRpc2NvdmVyZWQgc2tpbGwgcm9vdCBzbyBuZXcgc2tpbGxzIGZpcmUgb25EaWRDaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIHNraWxsIHJvb3QgZXhpc3RzIGJ1dCBpcyBlbXB0eTsgZ2V0RGlzY292ZXJ5UGF0aHMgc3RpbGwgcmVwb3J0cyBpdC5cblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJyB9KSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgaW5NZW1vcnlQYXRoVG9VcmkpKTtcblx0XHRjb25zdCBjbGllbnQgPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0YWdlbnRzOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgYWdlbnRzOiBbXSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgc291cmNlczogW10gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNraWxsczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW3sgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMnIH1dIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBza2lsbHM6IFtdIH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgQ29waWxvdENsaWVudDtcblxuXHRcdGF3YWl0IGRpc2NvdmVyeS5kaXNjb3ZlcihjbGllbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRjb25zdCBmaXJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzY292ZXJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNoYW5nZUNvdW50Kys7XG5cdFx0XHRmaXJlZC5jb21wbGV0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvbmV3LXNraWxsL1NLSUxMLm1kJywgJ25ldyB3b3Jrc3BhY2Ugc2tpbGwnKTtcblx0XHRhd2FpdCByYWNlVGltZW91dChmaXJlZC5wLCA1MDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2UgdG8gZmlyZSB3aGVuIGEgc2tpbGwgaXMgYWRkZWQgdW5kZXIgdGhlIGRpc2NvdmVyZWQgc2tpbGwgcm9vdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsYXRpb24gb2Ygb25lIGNhbGxlciBkb2VzIG5vdCBhZmZlY3QgYW5vdGhlciBjb25jdXJyZW50IGNhbGxlcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGNhbmNlbFNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjYW5jZWxTb3VyY2UpO1xuXG5cdFx0Y29uc3QgY2FuY2VsbGVkID0gZGlzY292ZXJ5LnNjYW4oY2FuY2VsU291cmNlLnRva2VuKTtcblx0XHRjb25zdCBub25DYW5jZWxsZWQgPSBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjYW5jZWxTb3VyY2UuY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjYW5jZWxsZWQpO1xuXHRcdGNvbnN0IGRpcmVjdG9yaWVzID0gYXdhaXQgbm9uQ2FuY2VsbGVkO1xuXHRcdGFzc2VydC5vayhkaXJlY3Rvcmllcy5zb21lKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuQWdlbnQpKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXJzIGFnZW50cywgc2tpbGxzLCBpbnN0cnVjdGlvbnMsIGFuZCBob29rcyBhY3Jvc3Mgd29ya3NwYWNlIGFuZCBob21lIHJvb3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdzQWdlbnQgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICdhZ2VudCBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NTa2lsbCA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJywgJ3NraWxsIGJvZHknKTtcblx0XHRjb25zdCB3c0luc3RyID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9iYXouaW5zdHJ1Y3Rpb25zLm1kJywgJ2luc3RyIGJvZHknKTtcblx0XHRjb25zdCB3c0hvb2sgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbicsICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXHRcdGNvbnN0IHVzZXJBZ2VudCA9IGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2FnZW50cy9xdXguYWdlbnQubWQnLCAndXNlciBhZ2VudCcpO1xuXHRcdGNvbnN0IHVzZXJDb3BpbG90U2tpbGwgPSBhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9za2lsbHMvY29waWxvdC16YXAvU0tJTEwubWQnLCAndXNlciBjb3BpbG90IHNraWxsJyk7XG5cdFx0Y29uc3QgdXNlclNraWxsID0gYXdhaXQgc2VlZCgnL2hvbWUvLmFnZW50cy9za2lsbHMvemFwL1NLSUxMLm1kJywgJ3VzZXIgc2tpbGwnKTtcblx0XHRjb25zdCB1c2VySG9vayA9IGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2hvb2tzL3Bvc3QtdG9vbC5qc29uJywgJ3tcIlBvc3RUb29sVXNlXCI6IFtdfScpO1xuXHRcdC8vIE5vaXNlIHRoYXQgc2hvdWxkIG5vdCBiZSBwaWNrZWQgdXBcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL25vdC1hbi1hZ2VudC50eHQnLCAnaWdub3JlZCcpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9ub3QtYS1ob29rLm1kJywgJ2lnbm9yZWQnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGRpcmVjdG9yaWVzID0gYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgZmlsZXMgPSBkaXJlY3Rvcmllcy5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gKHsgdXJpOiBmaWxlLnVyaSwgdHlwZTogZGlyZWN0b3J5LnR5cGUgfSkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmZpbGVzXS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpLCBbXG5cdFx0XHR7IHVyaTogdXNlckFnZW50LCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCB9LFxuXHRcdFx0eyB1cmk6IHVzZXJDb3BpbG90U2tpbGwsIHR5cGU6IERpc2NvdmVyZWRUeXBlLlNraWxsIH0sXG5cdFx0XHR7IHVyaTogdXNlckhvb2ssIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2sgfSxcblx0XHRcdHsgdXJpOiB1c2VyU2tpbGwsIHR5cGU6IERpc2NvdmVyZWRUeXBlLlNraWxsIH0sXG5cdFx0XHR7IHVyaTogd3NBZ2VudCwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQgfSxcblx0XHRcdHsgdXJpOiB3c0hvb2ssIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2sgfSxcblx0XHRcdHsgdXJpOiB3c0luc3RyLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5JbnN0cnVjdGlvbiB9LFxuXHRcdFx0eyB1cmk6IHdzU2tpbGwsIHR5cGU6IERpc2NvdmVyZWRUeXBlLlNraWxsIH0sXG5cdFx0XS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpKTtcblx0XHRhc3NlcnQub2soZGlyZWN0b3JpZXMuc29tZShkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LnVyaS50b1N0cmluZygpID09PSBVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdhZ2VudHMnKS50b1N0cmluZygpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBuZXN0ZWQgLmpzb24gaG9vayBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXN0ZWRXc0hvb2sgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvdGVhbS9zZWN1cml0eS9wcmUtdG9vbC5qc29uJywgJ3tcIlByZVRvb2xVc2VcIjogW119Jyk7XG5cdFx0Y29uc3QgbmVzdGVkVXNlckhvb2sgPSBhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9ob29rcy9kb21haW4vdG9vbHMvcG9zdC10b29sLmpzb24nLCAne1wiUG9zdFRvb2xVc2VcIjogW119Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBmaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmxhdE1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+ICh7IHVyaTogZmlsZS51cmksIHR5cGU6IGRpcmVjdG9yeS50eXBlIH0pKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5maWxlc10uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSwgW1xuXHRcdFx0eyB1cmk6IG5lc3RlZFVzZXJIb29rLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ib29rIH0sXG5cdFx0XHR7IHVyaTogbmVzdGVkV3NIb29rLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ib29rIH0sXG5cdFx0XS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXJzIGhvb2sgc2V0dGluZ3MgZmlsZXMgZnJvbSBmaXhlZCB3b3Jrc3BhY2UgbG9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdGh1YlNldHRpbmdzID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3Qvc2V0dGluZ3MuanNvbicsICd7XCJob29rc1wiOiB7XCJQcmVUb29sVXNlXCI6IFtdfX0nKTtcblx0XHRjb25zdCBnaXRodWJMb2NhbFNldHRpbmdzID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3Qvc2V0dGluZ3MubG9jYWwuanNvbicsICd7XCJob29rc1wiOiB7XCJQb3N0VG9vbFVzZVwiOiBbXX19Jyk7XG5cdFx0Y29uc3QgY2xhdWRlU2V0dGluZ3MgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicsICd7XCJob29rc1wiOiB7XCJTZXNzaW9uU3RhcnRcIjogW119fScpO1xuXHRcdGNvbnN0IGNsYXVkZUxvY2FsU2V0dGluZ3MgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbicsICd7XCJob29rc1wiOiB7XCJTZXNzaW9uRW5kXCI6IFtdfX0nKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC9zZXR0aW5ncy5kZXYuanNvbicsICd7XCJob29rc1wiOiB7XCJJZ25vcmVkXCI6IFtdfX0nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGZpbGVzID0gKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gKHsgdXJpOiBmaWxlLnVyaSwgdHlwZTogZGlyZWN0b3J5LnR5cGUgfSkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmZpbGVzXS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpLCBbXG5cdFx0XHR7IHVyaTogY2xhdWRlTG9jYWxTZXR0aW5ncywgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vayB9LFxuXHRcdFx0eyB1cmk6IGNsYXVkZVNldHRpbmdzLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ib29rIH0sXG5cdFx0XHR7IHVyaTogZ2l0aHViTG9jYWxTZXR0aW5ncywgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vayB9LFxuXHRcdFx0eyB1cmk6IGdpdGh1YlNldHRpbmdzLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ib29rIH0sXG5cdFx0XS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2Ugd2hlbiBmaXhlZCBob29rIHNldHRpbmdzIGZpbGUgaXMgbW9kaWZpZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3Qvc2V0dGluZ3MuanNvbicsICd7XCJob29rc1wiOiB7XCJQcmVUb29sVXNlXCI6IFtdfX0nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRjb25zdCBmaXJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzY292ZXJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNoYW5nZUNvdW50Kys7XG5cdFx0XHRmaXJlZC5jb21wbGV0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90L3NldHRpbmdzLmpzb24nLCAne1wiaG9va3NcIjoge1wiUHJlVG9vbFVzZVwiOiBbe1wiY29tbWFuZFwiOiBcImVjaG8gdGVzdFwifV19fScpO1xuXHRcdGF3YWl0IHJhY2VUaW1lb3V0KGZpcmVkLnAsIDUwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlQ291bnQsIDEsICdleHBlY3RlZCBvbkRpZENoYW5nZSB0byBmaXJlIHdoZW4gZml4ZWQgaG9vayBzZXR0aW5ncyBmaWxlIGlzIG1vZGlmaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4Y2x1ZGVzIGV4YWN0LWNhc2UgUkVBRE1FLm1kIGluc2lkZSBhZ2VudCBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdzQWdlbnQgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICdhZ2VudCBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NQbGFpbkFnZW50ID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9wbGFpbi5tZCcsICdwbGFpbiBhZ2VudCBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NMb3dlclJlYWRtZUFnZW50ID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZWFkbWUubWQnLCAnZG9jcyBsb3dlcicpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvUkVBRE1FLm1kJywgJ2RvY3MnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGZpbGVzID0gKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gKHsgdXJpOiBmaWxlLnVyaSwgdHlwZTogZGlyZWN0b3J5LnR5cGUgfSkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmZpbGVzXS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpLCBbXG5cdFx0XHR7IHVyaTogd3NBZ2VudCwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQgfSxcblx0XHRcdHsgdXJpOiB3c0xvd2VyUmVhZG1lQWdlbnQsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50IH0sXG5cdFx0XHR7IHVyaTogd3NQbGFpbkFnZW50LCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCB9LFxuXHRcdF0uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIG5vbi1SRUFETUUgbWFya2Rvd24gZmlsZXMgaW5zaWRlIGFnZW50IGZvbGRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd3NBZ2VudCA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgJ2FnZW50IGJvZHknKTtcblx0XHRjb25zdCB3c0xlZ2FjeU1vZGUgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2xlZ2FjeS5jaGF0bW9kZS5tZCcsICdsZWdhY3kgbW9kZSBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NQcm9tcHQgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Jhci5wcm9tcHQubWQnLCAncHJvbXB0IGJvZHknKTtcblx0XHRjb25zdCB3c0luc3RydWN0aW9uID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9iYXouaW5zdHJ1Y3Rpb25zLm1kJywgJ2luc3RydWN0aW9uIGJvZHknKTtcblx0XHRjb25zdCB3c0NvcGlsb3RJbnN0cnVjdGlvbnMgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ2NvcGlsb3QgaW5zdHJ1Y3Rpb25zIGJvZHknKTtcblx0XHRjb25zdCB3c1NraWxsID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9TS0lMTC5tZCcsICdza2lsbCBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NTa2lsbExvd2VyY2FzZSA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvc2tpbGwubWQnLCAnc2tpbGwgYm9keSBsb3dlcmNhc2UnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGZpbGVzID0gKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gKHsgdXJpOiBmaWxlLnVyaSwgdHlwZTogZGlyZWN0b3J5LnR5cGUgfSkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmZpbGVzXS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpLCBbXG5cdFx0XHR7IHVyaTogd3NDb3BpbG90SW5zdHJ1Y3Rpb25zLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCB9LFxuXHRcdFx0eyB1cmk6IHdzQWdlbnQsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50IH0sXG5cdFx0XHR7IHVyaTogd3NJbnN0cnVjdGlvbiwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQgfSxcblx0XHRcdHsgdXJpOiB3c0xlZ2FjeU1vZGUsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50IH0sXG5cdFx0XHR7IHVyaTogd3NQcm9tcHQsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50IH0sXG5cdFx0XHR7IHVyaTogd3NTa2lsbCwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQgfSxcblx0XHRcdHsgdXJpOiB3c1NraWxsTG93ZXJjYXNlLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCB9LFxuXHRcdF0uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBuZXN0ZWQgLmluc3RydWN0aW9ucy5tZCBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXN0ZWRXc0luc3RyID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy90ZWFtL3NlY3VyaXR5L3BvbGljeS5pbnN0cnVjdGlvbnMubWQnLCAnd29ya3NwYWNlIG5lc3RlZCBpbnN0cnVjdGlvbicpO1xuXHRcdGNvbnN0IG5lc3RlZFVzZXJJbnN0ciA9IGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2luc3RydWN0aW9ucy9kb21haW4vdG9vbHMvZGVlcC5pbnN0cnVjdGlvbnMubWQnLCAndXNlciBuZXN0ZWQgaW5zdHJ1Y3Rpb24nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGZpbGVzID0gKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKS5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gKHsgdXJpOiBmaWxlLnVyaSwgdHlwZTogZGlyZWN0b3J5LnR5cGUgfSkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmZpbGVzXS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpLCBbXG5cdFx0XHR7IHVyaTogbmVzdGVkVXNlckluc3RyLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5JbnN0cnVjdGlvbiB9LFxuXHRcdFx0eyB1cmk6IG5lc3RlZFdzSW5zdHIsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uIH0sXG5cdFx0XS5zb3J0KChhLCBiKSA9PiBhLnVyaS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi51cmkudG9TdHJpbmcoKSkpKTtcblx0fSk7XG5cblxuXG5cdHRlc3QoJ2J1bmRsZXMgbmVzdGVkIC5pbnN0cnVjdGlvbnMubWQgZmlsZXMgaW50byBydWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3RlYW0vc2VjdXJpdHkvcG9saWN5Lmluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgbmVzdGVkIGluc3RydWN0aW9uJyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zL2RvbWFpbi90b29scy9kZWVwLmluc3RydWN0aW9ucy5tZCcsICd1c2VyIG5lc3RlZCBpbnN0cnVjdGlvbicpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uUGx1Z2luQnVuZGxlciwgd29ya3NwYWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cblx0XHRjb25zdCByb290ID0gYnVuZGxlci5yb290VXJpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUluc3RyID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdydWxlcycsICdwb2xpY3kuaW5zdHJ1Y3Rpb25zLm1kJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2VJbnN0ci52YWx1ZS50b1N0cmluZygpLCAnd29ya3NwYWNlIG5lc3RlZCBpbnN0cnVjdGlvbicpO1xuXG5cdFx0Y29uc3QgdXNlckluc3RyID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdydWxlcycsICdkZWVwLmluc3RydWN0aW9ucy5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNlckluc3RyLnZhbHVlLnRvU3RyaW5nKCksICd1c2VyIG5lc3RlZCBpbnN0cnVjdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIGZpbGVzIHdlcmUgZGlzY292ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBFbnN1cmUgd29ya3NwYWNlIHJvb3QgZXhpc3RzXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHdvcmtzcGFjZSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHVzZXJIb21lKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGRpcmVjdG9yaWVzID0gYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHQvLyBFdmVuIHdpdGggbm8gZmlsZXMsIGRpc2NvdmVyeSBzaG91bGQgcmV0dXJuIGFsbCBzZWFyY2ggcm9vdCBkaXJlY3Rvcmllc1xuXHRcdC8vIGRpcmVjdG9yaWVzIHNob3VsZCBuZXZlciBiZSBudWxsL3VuZGVmaW5lZCwgc2hvdWxkIGJlIGFuIGVtcHR5IGFycmF5IGlmIG5vIGRpcmVjdG9yaWVzIGZvdW5kXG5cdFx0YXNzZXJ0Lm9rKEFycmF5LmlzQXJyYXkoZGlyZWN0b3JpZXMpLCBgRXhwZWN0ZWQgZGlyZWN0b3JpZXMgdG8gYmUgYW4gYXJyYXksIGdvdCAke0pTT04uc3RyaW5naWZ5KGRpcmVjdG9yaWVzKX1gKTtcblxuXHRcdC8vIFNpbmNlIHdlJ3JlIG5vdyBkaXNjb3ZlcmluZyBhbGwgcm9vdHMgZXZlbiBpZiB0aGV5IGRvbid0IGV4aXN0LFxuXHRcdC8vIHdlIGV4cGVjdCB0byBmaW5kIHNvbWUgZGlyZWN0b3JpZXMgKGF0IG1pbmltdW0gdGhlIHdvcmtzcGFjZSByb290IGZvciBBR0VOVFMubWQpXG5cdFx0aWYgKGRpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gSWYgbm8gZGlyZWN0b3JpZXMgYXJlIGRpc2NvdmVyZWQsIHRoYXQncyBva2F5IGZvciB0aGlzIHRlc3QgLSBpdCBtZWFucyBkaXNjb3Zlcnlcblx0XHRcdC8vIGlzIHN0aWxsIGxvb2tpbmcgZm9yIGFjdHVhbCBmaWxlcy9kaXJlY3Rvcmllcy4gVXBkYXRlIHRlc3QgZXhwZWN0YXRpb25zLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFsbCBkaXJlY3RvcmllcyBzaG91bGQgYmUgZW1wdHkgc2luY2Ugbm8gZmlsZXMgd2VyZSBjcmVhdGVkXG5cdFx0Zm9yIChjb25zdCBkaXIgb2YgZGlyZWN0b3JpZXMpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXIuZmlsZXMubGVuZ3RoLCAwLCBgRXhwZWN0ZWQgJHtkaXIudXJpLnRvU3RyaW5nKCl9IHRvIGhhdmUgbm8gZmlsZXNgKTtcblx0XHR9XG5cblx0XHQvLyBCdW5kbGVyIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gZGlyZWN0b3JpZXMgYXJlIGVtcHR5IChubyBjdXN0b21pemF0aW9ucyB0byBidW5kbGUpXG5cdFx0Y29uc3QgYnVuZGxlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uUGx1Z2luQnVuZGxlciwgd29ya3NwYWNlKSk7XG5cdFx0YXdhaXQgYnVuZGxlci5idW5kbGUoZGlyZWN0b3JpZXMpO1xuXHRcdC8vIEp1c3QgdmVyaWZ5IGJ1bmRsaW5nIGRvZXNuJ3QgY3Jhc2hcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBkaXNjb3ZlcmVkIGZpbGVzIHRvIHBhcnNlZCBwbHVnaW4gcHJlc2VydmluZyBzb3VyY2UgVVJJcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgJy0tLVxcbm5hbWU6IFdvcmtzcGFjZSBBZ2VudFxcbmRlc2NyaXB0aW9uOiBBZ2VudCBkZXNjcmlwdGlvblxcbi0tLVxcbmJvZHknKTtcblx0XHRjb25zdCBza2lsbCA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJywgJy0tLVxcbm5hbWU6IFdvcmtzcGFjZSBTa2lsbFxcbmRlc2NyaXB0aW9uOiBTa2lsbCBkZXNjcmlwdGlvblxcbi0tLVxcbmJvZHknKTtcblx0XHRjb25zdCBpbnN0cnVjdGlvbiA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYmF6Lmluc3RydWN0aW9ucy5tZCcsICctLS1cXG5uYW1lOiBXb3Jrc3BhY2UgUnVsZVxcbmRlc2NyaXB0aW9uOiBSdWxlIGRlc2NyaXB0aW9uXFxuZ2xvYnM6XFxuICAtIHNyYy8qKlxcbi0tLVxcbmJvZHknKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgdG9EaXNjb3ZlcmVkRGlyZWN0b3J5Q3VzdG9taXphdGlvbnMoYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIGZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBsdWdpbiA9IG1hcFRvUGFyc2VkUGx1Z2luKGN1c3RvbWl6YXRpb25zKTtcblxuXHRcdGFzc2VydC5vayhwbHVnaW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW4uYWdlbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbi5za2lsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luLmluc3RydWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdGFnZW50VXJpOiBwbHVnaW4uYWdlbnRzWzBdLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRhZ2VudERlc2NyaXB0aW9uOiBwbHVnaW4uYWdlbnRzWzBdLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRza2lsbFVyaTogcGx1Z2luLnNraWxsc1swXS51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0c2tpbGxEZXNjcmlwdGlvbjogcGx1Z2luLnNraWxsc1swXS5kZXNjcmlwdGlvbixcblx0XHRcdFx0cnVsZVVyaTogcGx1Z2luLmluc3RydWN0aW9uc1swXS51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cnVsZURlc2NyaXB0aW9uOiBwbHVnaW4uaW5zdHJ1Y3Rpb25zWzBdLmRlc2NyaXB0aW9uLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0YWdlbnRVcmk6IGFnZW50LnRvU3RyaW5nKCksXG5cdFx0XHRcdGFnZW50RGVzY3JpcHRpb246ICdBZ2VudCBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdHNraWxsVXJpOiBza2lsbC50b1N0cmluZygpLFxuXHRcdFx0XHRza2lsbERlc2NyaXB0aW9uOiAnU2tpbGwgZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRydWxlVXJpOiBpbnN0cnVjdGlvbi50b1N0cmluZygpLFxuXHRcdFx0XHRydWxlRGVzY3JpcHRpb246ICdSdWxlIGRlc2NyaXB0aW9uJyxcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBpbmNsdWRlIHBhcnNlZCBhZ2VudC1pbnN0cnVjdGlvbiBydWxlcyBpbiBtYXBUb1BhcnNlZFBsdWdpbiBvdXRwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBpbnN0cnVjdGlvbnMnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5hZ2VudHMvc2tpbGxzL2Jhci9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBiYXJcXG5kZXNjcmlwdGlvbjogU2tpbGwgZGVzY3JpcHRpb25cXG4tLS1cXG5ib2R5Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IHRvRGlzY292ZXJlZERpcmVjdG9yeUN1c3RvbWl6YXRpb25zKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLCBmaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBwbHVnaW4gPSBtYXBUb1BhcnNlZFBsdWdpbihjdXN0b21pemF0aW9ucyk7XG5cblx0XHRhc3NlcnQub2socGx1Z2luKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luLnNraWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW4uaW5zdHJ1Y3Rpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZyb20gbWFwVG9QYXJzZWRQbHVnaW4gd2hlbiBhbGwgY3VzdG9taXphdGlvbnMgYXJlIGFnZW50LWluc3RydWN0aW9uIGZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE9ubHkgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgYXJlIGRpc2NvdmVyZWQgXHUyMDE0IHRoZXNlIGFyZSBleGNsdWRlZCBmcm9tIHRoZSBwYXJzZWQgcGx1Z2luIG91dHB1dC5cblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAnd29ya3NwYWNlIGluc3RydWN0aW9ucycpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3VzZXIgaW5zdHJ1Y3Rpb25zJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IHRvRGlzY292ZXJlZERpcmVjdG9yeUN1c3RvbWl6YXRpb25zKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLCBmaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBwbHVnaW4gPSBtYXBUb1BhcnNlZFBsdWdpbihjdXN0b21pemF0aW9ucyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY2FuIGRpc2NvdmVycyBhZ2VudCBpbnN0cnVjdGlvbiBmaWxlcyBhY3Jvc3MgZXZlcnkgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vjb25kV29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlMicgfSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAnZmlyc3QnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlMi8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3NlY29uZCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlLCBzZWNvbmRXb3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBmaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlcblx0XHRcdC5maWx0ZXIoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uKVxuXHRcdFx0LmZsYXRNYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5maWxlcy5tYXAoZmlsZSA9PiBmaWxlLnVyaS50b1N0cmluZygpKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlcywgW2ZpcnN0LnRvU3RyaW5nKCksIHNlY29uZC50b1N0cmluZygpXS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpKTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3RydWN0b3IgcmVqZWN0cyBhbiBlbXB0eSB3b3JraW5nLWRpcmVjdG9yeSBzZXQgKG5vbi1lbXB0eSwgcHJpbWFyeS1maXJzdCBpbnZhcmlhbnQpJywgKCkgPT4ge1xuXHRcdGFzc2VydC50aHJvd3MoXG5cdFx0XHQoKSA9PiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW10sIHVzZXJIb21lLCBVUkkuZmlsZSksXG5cdFx0XHQvYXQgbGVhc3Qgb25lIHdvcmtpbmcgZGlyZWN0b3J5Lyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY2FuIGRpc2NvdmVycyBob29rcyBmcm9tIHRoZSBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5IG9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vjb25kV29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlMicgfSk7XG5cdFx0Ly8gYHdvcmtzcGFjZWAgaXMgcHJpbWFyeSAoaW5kZXggMCk7IGBzZWNvbmRXb3Jrc3BhY2VgIGlzIGEgbm9uLXByaW1hcnkgcm9vdC5cblx0XHRjb25zdCBwcmltYXJ5SG9vayA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJywgJ3tcIlByZVRvb2xVc2VcIjogW119Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZTIvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJywgJ3tcIlByZVRvb2xVc2VcIjogW119Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2UsIHNlY29uZFdvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGhvb2tGaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlcblx0XHRcdC5maWx0ZXIoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKVxuXHRcdFx0LmZsYXRNYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5maWxlcy5tYXAoZmlsZSA9PiBmaWxlLnVyaS50b1N0cmluZygpKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXG5cdFx0Ly8gT25seSB0aGUgcHJpbWFyeSByb290J3MgaG9vayBpcyBkaXNjb3ZlcmVkOyB0aGUgbm9uLXByaW1hcnkgcm9vdCdzIGhvb2sgaXMgaWdub3JlZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhvb2tGaWxlcywgW3ByaW1hcnlIb29rLnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXIgaW5jbHVkZXMgaG9va3MgZnJvbSB0aGUgcHJpbWFyeSB3b3JraW5nIGRpcmVjdG9yeSBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlY29uZFdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZTInIH0pO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJywgJ3tcIlByZVRvb2xVc2VcIjogW119Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZTIvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJywgJ3tcIlByZVRvb2xVc2VcIjogW119Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2UsIHNlY29uZFdvcmtzcGFjZV0sIHVzZXJIb21lLCBpbk1lbW9yeVBhdGhUb1VyaSkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IHtcblx0XHRcdHJwYzoge1xuXHRcdFx0XHRhZ2VudHM6IHsgZ2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSwgZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IGFnZW50czogW10gfSkgfSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB7IGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksIGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBzb3VyY2VzOiBbXSB9KSB9LFxuXHRcdFx0XHRza2lsbHM6IHsgZ2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSwgZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNraWxsczogW10gfSkgfSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RDbGllbnQ7XG5cblx0XHRjb25zdCBob29rQ2hpbGRyZW4gPSAoYXdhaXQgZGlzY292ZXJ5LmRpc2NvdmVyKGNsaWVudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpXG5cdFx0XHQuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5jb250ZW50cyA9PT0gJ2hvb2snKVxuXHRcdFx0LmZsYXRNYXAoY3VzdG9taXphdGlvbiA9PiAoY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkubWFwKGNoaWxkID0+IFVSSS5wYXJzZShjaGlsZC51cmkpLnBhdGgpKVxuXHRcdFx0LnNvcnQoKTtcblxuXHRcdC8vIEhvb2tzIGNvbWUgb25seSBmcm9tIHRoZSBwcmltYXJ5IHJvb3QgKGAvd29ya3NwYWNlYCksIG5ldmVyIGAvd29ya3NwYWNlMmAuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChob29rQ2hpbGRyZW4sIFsnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3ByZS10b29sLmpzb24nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVyIHJlc29sdmVzIHJlbGF0aXZlIGluc3RydWN0aW9ucyBhZ2FpbnN0IHRoZWlyIGF0dHJpYnV0ZWQgcHJvamVjdCByb290IGFuZCBncm91cHMgcGVyIHJvb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vjb25kV29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlMicgfSk7XG5cdFx0Y29uc3QgZmlyc3RGaWxlID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kRmlsZSA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UyLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAnc2Vjb25kJyk7XG5cblx0XHRsZXQgcmVxdWVzdGVkUHJvamVjdFBhdGhzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2UsIHNlY29uZFdvcmtzcGFjZV0sIHVzZXJIb21lLCBpbk1lbW9yeVBhdGhUb1VyaSkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IHtcblx0XHRcdHJwYzoge1xuXHRcdFx0XHRhZ2VudHM6IHsgZ2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSwgZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IGFnZW50czogW10gfSkgfSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRwYXRoczogW1xuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCBraW5kOiAnZmlsZScgfSxcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZTIvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsIGtpbmQ6ICdmaWxlJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKHJlcXVlc3Q6IEFnZW50c0Rpc2NvdmVyUmVxdWVzdCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVxdWVzdGVkUHJvamVjdFBhdGhzID0gcmVxdWVzdC5wcm9qZWN0UGF0aHM7XG5cdFx0XHRcdFx0XHQvLyBTYW1lIFJFTEFUSVZFIHNvdXJjZVBhdGggZnJvbSB0d28gcm9vdHMsIGRpc2FtYmlndWF0ZWQgb25seSBieSBwcm9qZWN0UGF0aC5cblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHNvdXJjZXM6IFtcblx0XHRcdFx0XHRcdFx0XHR7IGlkOiAnYScsIGxhYmVsOiAnQScsIHNvdXJjZVBhdGg6ICcuZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgYXBwbHlUbzogdW5kZWZpbmVkLCB0eXBlOiAncmVwbycsIHByb2plY3RQYXRoOiB3b3Jrc3BhY2UuZnNQYXRoIH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBpZDogJ2InLCBsYWJlbDogJ0InLCBzb3VyY2VQYXRoOiAnLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsIGFwcGx5VG86IHVuZGVmaW5lZCwgdHlwZTogJ3JlcG8nLCBwcm9qZWN0UGF0aDogc2Vjb25kV29ya3NwYWNlLmZzUGF0aCB9LFxuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRza2lsbHM6IHsgZ2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSwgZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNraWxsczogW10gfSkgfSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RDbGllbnQ7XG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IGRpc2NvdmVyeS5kaXNjb3ZlcihjbGllbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHJ1bGVEaXJlY3RvcmllcyA9IGN1c3RvbWl6YXRpb25zXG5cdFx0XHQuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5jb250ZW50cyA9PT0gJ3J1bGUnKVxuXHRcdFx0Lm1hcChjdXN0b21pemF0aW9uID0+ICh7XG5cdFx0XHRcdHVyaTogY3VzdG9taXphdGlvbi51cmksXG5cdFx0XHRcdGNoaWxkcmVuOiAoY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkubWFwKGNoaWxkID0+IGNoaWxkLnVyaSkuc29ydCgpLFxuXHRcdFx0fSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYS51cmkubG9jYWxlQ29tcGFyZShiLnVyaSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlcXVlc3RlZFByb2plY3RQYXRocywgcnVsZURpcmVjdG9yaWVzIH0sIHtcblx0XHRcdHJlcXVlc3RlZFByb2plY3RQYXRoczogW3dvcmtzcGFjZS5mc1BhdGgsIHNlY29uZFdvcmtzcGFjZS5mc1BhdGhdLFxuXHRcdFx0cnVsZURpcmVjdG9yaWVzOiBbXG5cdFx0XHRcdHsgdXJpOiB3b3Jrc3BhY2UudG9TdHJpbmcoKSwgY2hpbGRyZW46IFtmaXJzdEZpbGUudG9TdHJpbmcoKV0gfSxcblx0XHRcdFx0eyB1cmk6IHNlY29uZFdvcmtzcGFjZS50b1N0cmluZygpLCBjaGlsZHJlbjogW3NlY29uZEZpbGUudG9TdHJpbmcoKV0gfSxcblx0XHRcdF0uc29ydCgoYSwgYikgPT4gYS51cmkubG9jYWxlQ29tcGFyZShiLnVyaSkpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlciBzdXJmYWNlcyBhZ2VudHMgYW5kIHNraWxscyBmcm9tIGV2ZXJ5IHdvcmtpbmcgZGlyZWN0b3J5IGluIG9uZSBjYWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlY29uZFdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZTInIH0pO1xuXHRcdGxldCBhZ2VudFByb2plY3RQYXRoczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlLCBzZWNvbmRXb3Jrc3BhY2VdLCB1c2VySG9tZSwgaW5NZW1vcnlQYXRoVG9VcmkpKTtcblx0XHRjb25zdCBjbGllbnQgPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0YWdlbnRzOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKHJlcXVlc3Q6IEFnZW50c0Rpc2NvdmVyUmVxdWVzdCkgPT4ge1xuXHRcdFx0XHRcdFx0YWdlbnRQcm9qZWN0UGF0aHMgPSByZXF1ZXN0LnByb2plY3RQYXRocztcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGFnZW50czogW1xuXHRcdFx0XHRcdFx0XHRcdHsgaWQ6ICdvbmUnLCBuYW1lOiAnT25lJywgZGVzY3JpcHRpb246ICcnLCBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9vbmUuYWdlbnQubWQnLCB1c2VySW52b2NhYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0XHRcdHsgaWQ6ICd0d28nLCBuYW1lOiAnVHdvJywgZGVzY3JpcHRpb246ICcnLCBwYXRoOiAnL3dvcmtzcGFjZTIvLmdpdGh1Yi9hZ2VudHMvdHdvLmFnZW50Lm1kJywgdXNlckludm9jYWJsZTogZmFsc2UgfSxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB7IGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksIGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBzb3VyY2VzOiBbXSB9KSB9LFxuXHRcdFx0XHRza2lsbHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0c2tpbGxzOiBbXG5cdFx0XHRcdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYScsIG5hbWU6ICdBJywgZGVzY3JpcHRpb246ICcnIH0sXG5cdFx0XHRcdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UyLy5naXRodWIvc2tpbGxzL2InLCBuYW1lOiAnQicsIGRlc2NyaXB0aW9uOiAnJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RDbGllbnQ7XG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IGRpc2NvdmVyeS5kaXNjb3ZlcihjbGllbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGNoaWxkVXJpcyA9IGN1c3RvbWl6YXRpb25zXG5cdFx0XHQuZmxhdE1hcChjdXN0b21pemF0aW9uID0+IChjdXN0b21pemF0aW9uLmNoaWxkcmVuID8/IFtdKS5tYXAoY2hpbGQgPT4gVVJJLnBhcnNlKGNoaWxkLnVyaSkucGF0aCkpXG5cdFx0XHQuc29ydCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFnZW50UHJvamVjdFBhdGhzLCBjaGlsZFVyaXMgfSwge1xuXHRcdFx0YWdlbnRQcm9qZWN0UGF0aHM6IFt3b3Jrc3BhY2UuZnNQYXRoLCBzZWNvbmRXb3Jrc3BhY2UuZnNQYXRoXSxcblx0XHRcdGNoaWxkVXJpczogW1xuXHRcdFx0XHQnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9vbmUuYWdlbnQubWQnLFxuXHRcdFx0XHQnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9hJyxcblx0XHRcdFx0Jy93b3Jrc3BhY2UyLy5naXRodWIvYWdlbnRzL3R3by5hZ2VudC5tZCcsXG5cdFx0XHRcdCcvd29ya3NwYWNlMi8uZ2l0aHViL3NraWxscy9iJyxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cblxuc3VpdGUoJ1Nlc3Npb25QbHVnaW5CdW5kbGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCB3b3Jrc3BhY2U6IFVSSTtcblx0bGV0IHVzZXJIb21lOiBVUkk7XG5cdGxldCBwbHVnaW5CYXNlUGF0aDogVVJJO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBtZW1GcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgbWVtRnMpKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cblx0XHR3b3Jrc3BhY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UnIH0pO1xuXHRcdHVzZXJIb21lID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvaG9tZScgfSk7XG5cdFx0cGx1Z2luQmFzZVBhdGggPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudFBsdWdpbnMnIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50UGx1Z2luTWFuYWdlciwgeyBiYXNlUGF0aDogcGx1Z2luQmFzZVBhdGggfSBhcyBQYXJ0aWFsPElBZ2VudFBsdWdpbk1hbmFnZXI+KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRhc3luYyBmdW5jdGlvbiBzZWVkKHBhdGg6IHN0cmluZywgY29udGVudCA9ICcnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aCB9KTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0dGVzdCgnYnVuZGxlcyBkaXNjb3ZlcmVkIGZpbGVzIGludG8gdGhlIHN5bnRoZXRpYyBwbHVnaW4gdHJlZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICdhZ2VudCBib2R5Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9iYXIvU0tJTEwubWQnLCAnc2tpbGwgYm9keScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYmF6Lmluc3RydWN0aW9ucy5tZCcsICdpbnN0ciBib2R5Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3ByZS10b29sLmpzb24nLCAne1wiUHJlVG9vbFVzZVwiOiBbXX0nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblBsdWdpbkJ1bmRsZXIsIHdvcmtzcGFjZSkpO1xuXHRcdGNvbnN0IGRpcmVjdG9yaWVzID0gYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoZGlyZWN0b3JpZXMpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZWYubmFtZSwgJ1ZTIENvZGUgU3luY2VkIERhdGEnKTtcblx0XHRhc3NlcnQub2socmVzdWx0LnJlZi5ub25jZSk7XG5cblx0XHRjb25zdCByb290ID0gYnVuZGxlci5yb290VXJpO1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICcucGx1Z2luJywgJ3BsdWdpbi5qc29uJykpO1xuXHRcdGFzc2VydC5tYXRjaChtYW5pZmVzdC52YWx1ZS50b1N0cmluZygpLCAvXCJuYW1lXCI6IFwiVlMgQ29kZSBTeW5jZWQgRGF0YVwiLyk7XG5cblx0XHRjb25zdCBhZ2VudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAnYWdlbnRzJywgJ2Zvby5hZ2VudC5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnQudmFsdWUudG9TdHJpbmcoKSwgJ2FnZW50IGJvZHknKTtcblxuXHRcdGNvbnN0IHNraWxsID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdza2lsbHMnLCAnYmFyJywgJ1NLSUxMLm1kJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChza2lsbC52YWx1ZS50b1N0cmluZygpLCAnc2tpbGwgYm9keScpO1xuXG5cdFx0Y29uc3QgaW5zdHIgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocm9vdCwgJ3J1bGVzJywgJ2Jhei5pbnN0cnVjdGlvbnMubWQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluc3RyLnZhbHVlLnRvU3RyaW5nKCksICdpbnN0ciBib2R5Jyk7XG5cblx0XHRjb25zdCBob29rID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdob29rcycsICdwcmUtdG9vbC5qc29uJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob29rLnZhbHVlLnRvU3RyaW5nKCksICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ3Byb2R1Y2VzIGEgc3RhYmxlIG5vbmNlIGZvciBpZGVudGljYWwgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICdhZ2VudCBib2R5Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9iYXIvU0tJTEwubWQnLCAnc2tpbGwgYm9keScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0Y29uc3QgYnVuZGxlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uUGx1Z2luQnVuZGxlciwgd29ya3NwYWNlKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cblx0XHRsZXQgd3JpdGVDYWxscyA9IDA7XG5cdFx0bGV0IGRlbGV0ZUNhbGxzID0gMDtcblx0XHRjb25zdCBvcmlnaW5hbFdyaXRlRmlsZSA9IGZpbGVTZXJ2aWNlLndyaXRlRmlsZS5iaW5kKGZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBvcmlnaW5hbERlbCA9IGZpbGVTZXJ2aWNlLmRlbC5iaW5kKGZpbGVTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUgPSBvcmlnaW5hbFdyaXRlRmlsZSBhcyB0eXBlb2YgZmlsZVNlcnZpY2Uud3JpdGVGaWxlO1xuXHRcdFx0XHRmaWxlU2VydmljZS5kZWwgPSBvcmlnaW5hbERlbCBhcyB0eXBlb2YgZmlsZVNlcnZpY2UuZGVsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZSA9ICgoLi4uYXJnczogUGFyYW1ldGVyczx0eXBlb2YgZmlsZVNlcnZpY2Uud3JpdGVGaWxlPikgPT4ge1xuXHRcdFx0d3JpdGVDYWxscysrO1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsV3JpdGVGaWxlKC4uLmFyZ3MpO1xuXHRcdH0pIGFzIHR5cGVvZiBmaWxlU2VydmljZS53cml0ZUZpbGU7XG5cdFx0ZmlsZVNlcnZpY2UuZGVsID0gKCguLi5hcmdzOiBQYXJhbWV0ZXJzPHR5cGVvZiBmaWxlU2VydmljZS5kZWw+KSA9PiB7XG5cdFx0XHRkZWxldGVDYWxscysrO1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsRGVsKC4uLmFyZ3MpO1xuXHRcdH0pIGFzIHR5cGVvZiBmaWxlU2VydmljZS5kZWw7XG5cblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBidW5kbGVyLmJ1bmRsZShhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0YXNzZXJ0Lm9rKGZpcnN0KTtcblx0XHRhc3NlcnQub2soc2Vjb25kKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0Tm9uY2U6IGZpcnN0LnJlZi5ub25jZSxcblx0XHRcdHNlY29uZE5vbmNlOiBzZWNvbmQucmVmLm5vbmNlLFxuXHRcdFx0d3JpdGVDYWxscyxcblx0XHRcdGRlbGV0ZUNhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0Tm9uY2U6IGZpcnN0LnJlZi5ub25jZSxcblx0XHRcdHNlY29uZE5vbmNlOiBmaXJzdC5yZWYubm9uY2UsXG5cdFx0XHR3cml0ZUNhbGxzOiAwLFxuXHRcdFx0ZGVsZXRlQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdpdGhvdXQgcmV3cml0aW5nIHdoZW4gY2FuY2VsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgJ2FnZW50IGJvZHknKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblBsdWdpbkJ1bmRsZXIsIHdvcmtzcGFjZSkpO1xuXG5cdFx0bGV0IHdyaXRlQ2FsbHMgPSAwO1xuXHRcdGxldCBkZWxldGVDYWxscyA9IDA7XG5cdFx0Y29uc3Qgb3JpZ2luYWxXcml0ZUZpbGUgPSBmaWxlU2VydmljZS53cml0ZUZpbGUuYmluZChmaWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxEZWwgPSBmaWxlU2VydmljZS5kZWwuYmluZChmaWxlU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlID0gb3JpZ2luYWxXcml0ZUZpbGUgYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLndyaXRlRmlsZTtcblx0XHRcdFx0ZmlsZVNlcnZpY2UuZGVsID0gb3JpZ2luYWxEZWwgYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLmRlbDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUgPSAoKC4uLmFyZ3M6IFBhcmFtZXRlcnM8dHlwZW9mIGZpbGVTZXJ2aWNlLndyaXRlRmlsZT4pID0+IHtcblx0XHRcdHdyaXRlQ2FsbHMrKztcblx0XHRcdHJldHVybiBvcmlnaW5hbFdyaXRlRmlsZSguLi5hcmdzKTtcblx0XHR9KSBhcyB0eXBlb2YgZmlsZVNlcnZpY2Uud3JpdGVGaWxlO1xuXHRcdGZpbGVTZXJ2aWNlLmRlbCA9ICgoLi4uYXJnczogUGFyYW1ldGVyczx0eXBlb2YgZmlsZVNlcnZpY2UuZGVsPikgPT4ge1xuXHRcdFx0ZGVsZXRlQ2FsbHMrKztcblx0XHRcdHJldHVybiBvcmlnaW5hbERlbCguLi5hcmdzKTtcblx0XHR9KSBhcyB0eXBlb2YgZmlsZVNlcnZpY2UuZGVsO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdCwgd3JpdGVDYWxscywgZGVsZXRlQ2FsbHMgfSwgeyByZXN1bHQ6IHVuZGVmaW5lZCwgd3JpdGVDYWxsczogMCwgZGVsZXRlQ2FsbHM6IDAgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmZlcmVudCB3b3JraW5nIGRpcmVjdG9yaWVzIHByb2R1Y2UgZGlmZmVyZW50IGJ1bmRsZSBhdXRob3JpdGllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvdGhlcldvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL290aGVyLXdvcmtzcGFjZScgfSk7XG5cdFx0Y29uc3QgYSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uUGx1Z2luQnVuZGxlciwgd29ya3NwYWNlKSk7XG5cdFx0Y29uc3QgYiA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uUGx1Z2luQnVuZGxlciwgb3RoZXJXb3Jrc3BhY2UpKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYS5yb290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
