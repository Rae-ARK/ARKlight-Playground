import assert from "assert";
import { join } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { codexBinaryTriple, codexPackageSuffix, resolveCodexDevSdkRoot } from "../../../node/codex/codexAgent.js";
suite("codex package paths", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("codexPackageSuffix", () => {
    test("every supported (platform, arch) returns the npm optionalDependencies suffix", () => {
      assert.deepStrictEqual({
        "darwin-x64": codexPackageSuffix("darwin", "x64"),
        "darwin-arm64": codexPackageSuffix("darwin", "arm64"),
        "linux-x64": codexPackageSuffix("linux", "x64"),
        "linux-arm64": codexPackageSuffix("linux", "arm64"),
        "win32-x64": codexPackageSuffix("win32", "x64"),
        "win32-arm64": codexPackageSuffix("win32", "arm64")
      }, {
        "darwin-x64": "darwin-x64",
        "darwin-arm64": "darwin-arm64",
        "linux-x64": "linux-x64",
        "linux-arm64": "linux-arm64",
        "win32-x64": "win32-x64",
        "win32-arm64": "win32-arm64"
      });
    });
    test("never returns a -musl suffix on Linux (Codex is statically musl-linked)", () => {
      assert.strictEqual(codexPackageSuffix("linux", "x64"), "linux-x64");
      assert.strictEqual(codexPackageSuffix("linux", "arm64"), "linux-arm64");
    });
    test("returns undefined for unsupported platforms and architectures", () => {
      assert.strictEqual(codexPackageSuffix("freebsd", "x64"), void 0);
      assert.strictEqual(codexPackageSuffix("aix", "arm64"), void 0);
      assert.strictEqual(codexPackageSuffix("darwin", "ia32"), void 0);
      assert.strictEqual(codexPackageSuffix("linux", "arm"), void 0);
      assert.strictEqual(codexPackageSuffix("win32", "mips"), void 0);
    });
  });
  suite("codexBinaryTriple", () => {
    test("every suffix produced by codexPackageSuffix maps to a rust target triple", () => {
      assert.deepStrictEqual({
        "linux-x64": codexBinaryTriple("linux-x64"),
        "linux-arm64": codexBinaryTriple("linux-arm64"),
        "darwin-x64": codexBinaryTriple("darwin-x64"),
        "darwin-arm64": codexBinaryTriple("darwin-arm64"),
        "win32-x64": codexBinaryTriple("win32-x64"),
        "win32-arm64": codexBinaryTriple("win32-arm64")
      }, {
        "linux-x64": "x86_64-unknown-linux-musl",
        "linux-arm64": "aarch64-unknown-linux-musl",
        "darwin-x64": "x86_64-apple-darwin",
        "darwin-arm64": "aarch64-apple-darwin",
        "win32-x64": "x86_64-pc-windows-msvc",
        "win32-arm64": "aarch64-pc-windows-msvc"
      });
    });
    test("returns undefined for unknown suffixes", () => {
      assert.strictEqual(codexBinaryTriple("linux-x64-musl"), void 0);
      assert.strictEqual(codexBinaryTriple("darwin-arm"), void 0);
      assert.strictEqual(codexBinaryTriple(""), void 0);
    });
  });
  suite("resolveCodexDevSdkRoot", () => {
    test("returns the directory containing node_modules when @openai/codex resolves", async () => {
      const root = join("home", "me", "vscode");
      const pkgJson = join(root, "node_modules", "@openai", "codex", "package.json");
      assert.strictEqual(await resolveCodexDevSdkRoot(() => pkgJson), root);
    });
    test("returns undefined when resolution throws (e.g. built product without the devDependency)", async () => {
      assert.strictEqual(await resolveCodexDevSdkRoot(() => {
        throw new Error("Cannot find module");
      }), void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY29kZXgvY29kZXhQYWNrYWdlUGF0aHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY29kZXhCaW5hcnlUcmlwbGUsIGNvZGV4UGFja2FnZVN1ZmZpeCwgcmVzb2x2ZUNvZGV4RGV2U2RrUm9vdCB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhBZ2VudC5qcyc7XG5cbnN1aXRlKCdjb2RleCBwYWNrYWdlIHBhdGhzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdjb2RleFBhY2thZ2VTdWZmaXgnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdldmVyeSBzdXBwb3J0ZWQgKHBsYXRmb3JtLCBhcmNoKSByZXR1cm5zIHRoZSBucG0gb3B0aW9uYWxEZXBlbmRlbmNpZXMgc3VmZml4JywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIGJ1aWxkIHBpcGVsaW5lIGFuZCBjb2RleEJpbmFyeVRyaXBsZSBib3RoIHJlbHkgb24gdGhlIHJ1bnRpbWVcblx0XHRcdC8vIHJlYWNoaW5nIGV4YWN0bHkgb25lIG9mIHRoZXNlIHN0cmluZ3MuIE5ldyBzdXBwb3J0ZWQgcGxhdGZvcm1zXG5cdFx0XHQvLyBtdXN0IHVwZGF0ZSB0aGlzIHRhYmxlLCB0aGUgYnVpbGQncyBgZ2V0U2RrVGFyZ2V0Rm9yQnVpbGRgLCBBTkRcblx0XHRcdC8vIGNvZGV4QmluYXJ5VHJpcGxlIGluIGxvY2tzdGVwLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdCdkYXJ3aW4teDY0JzogY29kZXhQYWNrYWdlU3VmZml4KCdkYXJ3aW4nLCAneDY0JyksXG5cdFx0XHRcdCdkYXJ3aW4tYXJtNjQnOiBjb2RleFBhY2thZ2VTdWZmaXgoJ2RhcndpbicsICdhcm02NCcpLFxuXHRcdFx0XHQnbGludXgteDY0JzogY29kZXhQYWNrYWdlU3VmZml4KCdsaW51eCcsICd4NjQnKSxcblx0XHRcdFx0J2xpbnV4LWFybTY0JzogY29kZXhQYWNrYWdlU3VmZml4KCdsaW51eCcsICdhcm02NCcpLFxuXHRcdFx0XHQnd2luMzIteDY0JzogY29kZXhQYWNrYWdlU3VmZml4KCd3aW4zMicsICd4NjQnKSxcblx0XHRcdFx0J3dpbjMyLWFybTY0JzogY29kZXhQYWNrYWdlU3VmZml4KCd3aW4zMicsICdhcm02NCcpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHQnZGFyd2luLXg2NCc6ICdkYXJ3aW4teDY0Jyxcblx0XHRcdFx0J2Rhcndpbi1hcm02NCc6ICdkYXJ3aW4tYXJtNjQnLFxuXHRcdFx0XHQnbGludXgteDY0JzogJ2xpbnV4LXg2NCcsXG5cdFx0XHRcdCdsaW51eC1hcm02NCc6ICdsaW51eC1hcm02NCcsXG5cdFx0XHRcdCd3aW4zMi14NjQnOiAnd2luMzIteDY0Jyxcblx0XHRcdFx0J3dpbjMyLWFybTY0JzogJ3dpbjMyLWFybTY0Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmV2ZXIgcmV0dXJucyBhIC1tdXNsIHN1ZmZpeCBvbiBMaW51eCAoQ29kZXggaXMgc3RhdGljYWxseSBtdXNsLWxpbmtlZCknLCAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uIGd1YXJkOiBhdCBvbmUgcG9pbnQgZHVyaW5nIHRoZSBwZXItcGxhdGZvcm0gcmVmYWN0b3Jcblx0XHRcdC8vIHRoZSBoZWxwZXIgc3RpbGwgYXBwZW5kZWQgYC1tdXNsYCBmb3IgbXVzbCBMaW51eCBob3N0cy4gQ29kZXgnc1xuXHRcdFx0Ly8gYGxpbnV4LTxhcmNoPmAgcGFja2FnZSBzZXJ2ZXMgYm90aCBnbGliYyBhbmQgbXVzbCwgc28gdGhlIHN1ZmZpeFxuXHRcdFx0Ly8gbXVzdCBOT1QgYmUgYWRkZWQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZXhQYWNrYWdlU3VmZml4KCdsaW51eCcsICd4NjQnKSwgJ2xpbnV4LXg2NCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGV4UGFja2FnZVN1ZmZpeCgnbGludXgnLCAnYXJtNjQnKSwgJ2xpbnV4LWFybTY0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgdW5zdXBwb3J0ZWQgcGxhdGZvcm1zIGFuZCBhcmNoaXRlY3R1cmVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGV4UGFja2FnZVN1ZmZpeCgnZnJlZWJzZCcgYXMgTm9kZUpTLlBsYXRmb3JtLCAneDY0JyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZXhQYWNrYWdlU3VmZml4KCdhaXgnIGFzIE5vZGVKUy5QbGF0Zm9ybSwgJ2FybTY0JyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZXhQYWNrYWdlU3VmZml4KCdkYXJ3aW4nLCAnaWEzMicpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGV4UGFja2FnZVN1ZmZpeCgnbGludXgnLCAnYXJtJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZXhQYWNrYWdlU3VmZml4KCd3aW4zMicsICdtaXBzJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb2RleEJpbmFyeVRyaXBsZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2V2ZXJ5IHN1ZmZpeCBwcm9kdWNlZCBieSBjb2RleFBhY2thZ2VTdWZmaXggbWFwcyB0byBhIHJ1c3QgdGFyZ2V0IHRyaXBsZScsICgpID0+IHtcblx0XHRcdC8vIFRoZSB0d28gaGVscGVycyBhcmUgcGFpcmVkOiB0aGUgZG93bmxvYWRlciBwaWNrcyBhIHBhY2thZ2UgdmlhXG5cdFx0XHQvLyBjb2RleFBhY2thZ2VTdWZmaXgsIHRoZW4gdGhpcyBmdW5jdGlvbiB0ZWxscyBfc3RhcnRDb25uZWN0aW9uXG5cdFx0XHQvLyB3aGljaCBgdmVuZG9yLzx0cmlwbGU+L2Jpbi9jb2RleGAgZXhpc3RzIGluc2lkZSBpdC4gQSBzdWZmaXhcblx0XHRcdC8vIHdpdGhvdXQgYSBtYXRjaGluZyB0cmlwbGUgd291bGQgY3Jhc2ggYXQgc3Bhd24gXHUyMDE0IHNvIHRoaXMgdGVzdFxuXHRcdFx0Ly8gZ3VhcmRzIHRoZSB1bmlvbi5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHQnbGludXgteDY0JzogY29kZXhCaW5hcnlUcmlwbGUoJ2xpbnV4LXg2NCcpLFxuXHRcdFx0XHQnbGludXgtYXJtNjQnOiBjb2RleEJpbmFyeVRyaXBsZSgnbGludXgtYXJtNjQnKSxcblx0XHRcdFx0J2Rhcndpbi14NjQnOiBjb2RleEJpbmFyeVRyaXBsZSgnZGFyd2luLXg2NCcpLFxuXHRcdFx0XHQnZGFyd2luLWFybTY0JzogY29kZXhCaW5hcnlUcmlwbGUoJ2Rhcndpbi1hcm02NCcpLFxuXHRcdFx0XHQnd2luMzIteDY0JzogY29kZXhCaW5hcnlUcmlwbGUoJ3dpbjMyLXg2NCcpLFxuXHRcdFx0XHQnd2luMzItYXJtNjQnOiBjb2RleEJpbmFyeVRyaXBsZSgnd2luMzItYXJtNjQnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0J2xpbnV4LXg2NCc6ICd4ODZfNjQtdW5rbm93bi1saW51eC1tdXNsJyxcblx0XHRcdFx0J2xpbnV4LWFybTY0JzogJ2FhcmNoNjQtdW5rbm93bi1saW51eC1tdXNsJyxcblx0XHRcdFx0J2Rhcndpbi14NjQnOiAneDg2XzY0LWFwcGxlLWRhcndpbicsXG5cdFx0XHRcdCdkYXJ3aW4tYXJtNjQnOiAnYWFyY2g2NC1hcHBsZS1kYXJ3aW4nLFxuXHRcdFx0XHQnd2luMzIteDY0JzogJ3g4Nl82NC1wYy13aW5kb3dzLW1zdmMnLFxuXHRcdFx0XHQnd2luMzItYXJtNjQnOiAnYWFyY2g2NC1wYy13aW5kb3dzLW1zdmMnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgdW5rbm93biBzdWZmaXhlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RleEJpbmFyeVRyaXBsZSgnbGludXgteDY0LW11c2wnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RleEJpbmFyeVRyaXBsZSgnZGFyd2luLWFybScpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGV4QmluYXJ5VHJpcGxlKCcnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc29sdmVDb2RleERldlNka1Jvb3QnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBkaXJlY3RvcnkgY29udGFpbmluZyBub2RlX21vZHVsZXMgd2hlbiBAb3BlbmFpL2NvZGV4IHJlc29sdmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gYHJlcXVpcmUucmVzb2x2ZSgnQG9wZW5haS9jb2RleC9wYWNrYWdlLmpzb24nKWAgeWllbGRzXG5cdFx0XHQvLyBgPHJvb3Q+L25vZGVfbW9kdWxlcy9Ab3BlbmFpL2NvZGV4L3BhY2thZ2UuanNvbmA7IHRoZSBoZWxwZXIgd2Fsa3Ncblx0XHRcdC8vIGZvdXIgc2VnbWVudHMgdXAgdG8gcmVjb3ZlciBgPHJvb3Q+YCBcdTIwMTQgdGhlIGRpciBgX3N0YXJ0Q29ubmVjdGlvbmBcblx0XHRcdC8vIGpvaW5zIGBub2RlX21vZHVsZXMvQG9wZW5haS9jb2RleC08dGFyZ2V0PmAgb250by5cblx0XHRcdGNvbnN0IHJvb3QgPSBqb2luKCdob21lJywgJ21lJywgJ3ZzY29kZScpO1xuXHRcdFx0Y29uc3QgcGtnSnNvbiA9IGpvaW4ocm9vdCwgJ25vZGVfbW9kdWxlcycsICdAb3BlbmFpJywgJ2NvZGV4JywgJ3BhY2thZ2UuanNvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVDb2RleERldlNka1Jvb3QoKCkgPT4gcGtnSnNvbiksIHJvb3QpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiByZXNvbHV0aW9uIHRocm93cyAoZS5nLiBidWlsdCBwcm9kdWN0IHdpdGhvdXQgdGhlIGRldkRlcGVuZGVuY3kpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVDb2RleERldlNka1Jvb3QoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmaW5kIG1vZHVsZScpOyB9KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59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
