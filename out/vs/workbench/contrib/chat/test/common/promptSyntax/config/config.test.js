import assert from "assert";
import { mockService } from "../utils/mock.js";
import { PromptsConfig } from "../../../../common/promptSyntax/config/config.js";
import { PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
function getPaths(folders) {
  return folders.map((f) => f.path);
}
function createMock(value) {
  return mockService({
    getValue(key) {
      assert(
        typeof key === "string",
        `Expected string configuration key, got '${typeof key}'.`
      );
      assert(
        [PromptsConfig.PROMPT_LOCATIONS_KEY, PromptsConfig.INSTRUCTIONS_LOCATION_KEY, PromptsConfig.MODE_LOCATION_KEY, PromptsConfig.SKILLS_LOCATION_KEY].includes(key),
        `Unsupported configuration key '${key}'.`
      );
      return value;
    }
  });
}
suite("PromptsConfig", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getLocationsValue", () => {
    test("undefined", () => {
      const configService = createMock(void 0);
      assert.strictEqual(
        PromptsConfig.getLocationsValue(configService, PromptsType.prompt),
        void 0,
        "Must read correct value."
      );
    });
    test("null", () => {
      const configService = createMock(null);
      assert.strictEqual(
        PromptsConfig.getLocationsValue(configService, PromptsType.prompt),
        void 0,
        "Must read correct value."
      );
    });
    test("undefined for skill", () => {
      const configService = createMock(void 0);
      assert.strictEqual(
        PromptsConfig.getLocationsValue(configService, PromptsType.skill),
        void 0,
        "Must read correct value for skills."
      );
    });
    test("null for skill", () => {
      const configService = createMock(null);
      assert.strictEqual(
        PromptsConfig.getLocationsValue(configService, PromptsType.skill),
        void 0,
        "Must read correct value for skills."
      );
    });
    suite("object", () => {
      test("empty", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({}), PromptsType.prompt),
          {},
          "Must read correct value."
        );
      });
      test("only valid strings", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            "/root/.bashrc": true,
            "../../folder/.hidden-folder/config.xml": true,
            "/srv/www/Public_html/.htaccess": true,
            "../../another.folder/.WEIRD_FILE.log": true,
            "./folder.name/file.name": true,
            "/media/external/backup.tar.gz": true,
            "/Media/external/.secret.backup": true,
            "../relative/path.to.file": true,
            "./folderName.with.dots/more.dots.extension": true,
            "some/folder.with.dots/another.file": true,
            "/var/logs/app.01.05.error": true,
            "./.tempfile": true
          }), PromptsType.prompt),
          {
            "/root/.bashrc": true,
            "../../folder/.hidden-folder/config.xml": true,
            "/srv/www/Public_html/.htaccess": true,
            "../../another.folder/.WEIRD_FILE.log": true,
            "./folder.name/file.name": true,
            "/media/external/backup.tar.gz": true,
            "/Media/external/.secret.backup": true,
            "../relative/path.to.file": true,
            "./folderName.with.dots/more.dots.extension": true,
            "some/folder.with.dots/another.file": true,
            "/var/logs/app.01.05.error": true,
            "./.tempfile": true
          },
          "Must read correct value."
        );
      });
      test("filters out non valid entries", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            "../assets/img/logo.v2.png": true,
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "../.local/bin/script.sh": true,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "../../development/branch.name/some.test": true,
            "/Home/user/.ssh/config": true,
            "./hidden.dir/.subhidden": "\f",
            "/tmp/.temp.folder/cache.db": true,
            "/opt/software/v3.2.1/build.log": "  ",
            "": true,
            "./scripts/.old.build.sh": true,
            "/var/data/datafile.2025-02-05.json": "\n",
            "\n\n": true,
            "	": true,
            "\v": true,
            "\f": true,
            "\r\n": true,
            "\f\f": true,
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 1234
          }), PromptsType.prompt),
          {
            "../assets/img/logo.v2.png": true,
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "../.local/bin/script.sh": true,
            "../../development/branch.name/some.test": true,
            "/Home/user/.ssh/config": true,
            "/tmp/.temp.folder/cache.db": true,
            "./scripts/.old.build.sh": true
          },
          "Must read correct value."
        );
      });
      test("only invalid or false values", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            "../assets/IMG/logo.v2.png": "",
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "./hidden.dir/.subhidden": "\f",
            "/opt/Software/v3.2.1/build.log": "  ",
            "/var/data/datafile.2025-02-05.json": "\n",
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 2345
          }), PromptsType.prompt),
          {
            "/mnt/storage/video.archive/episode.01.mkv": false
          },
          "Must read correct value."
        );
      });
      test("skill locations - empty", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({}), PromptsType.skill),
          {},
          "Must read correct value for skills."
        );
      });
      test("skill locations - valid paths", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            ".github/skills": true,
            ".claude/skills": true,
            "/custom/skills/folder": true,
            "./relative/skills": true
          }), PromptsType.skill),
          {
            ".github/skills": true,
            ".claude/skills": true,
            "/custom/skills/folder": true,
            "./relative/skills": true
          },
          "Must read correct skill locations."
        );
      });
      test("skill locations - filters invalid entries", () => {
        assert.deepStrictEqual(
          PromptsConfig.getLocationsValue(createMock({
            ".github/skills": true,
            ".claude/skills": "	\n",
            "/invalid/path": "",
            "": true,
            "./valid/skills": true,
            "\n": true
          }), PromptsType.skill),
          {
            ".github/skills": true,
            "./valid/skills": true
          },
          "Must filter invalid skill locations."
        );
      });
    });
  });
  suite("sourceLocations", () => {
    test("undefined", () => {
      const configService = createMock(void 0);
      assert.deepStrictEqual(
        getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.prompt)),
        [],
        "Must read correct value."
      );
    });
    test("null", () => {
      const configService = createMock(null);
      assert.deepStrictEqual(
        getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.prompt)),
        [],
        "Must read correct value."
      );
    });
    suite("object", () => {
      test("empty", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({}), PromptsType.prompt)),
          [".github/prompts"],
          "Must read correct value."
        );
      });
      test("only valid strings", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/root/.bashrc": true,
            "../../folder/.hidden-folder/config.xml": true,
            "/srv/www/Public_html/.htaccess": true,
            "../../another.folder/.WEIRD_FILE.log": true,
            "./folder.name/file.name": true,
            "/media/external/backup.tar.gz": true,
            "/Media/external/.secret.backup": true,
            "../relative/path.to.file": true,
            "./folderName.with.dots/more.dots.extension": true,
            "some/folder.with.dots/another.file": true,
            "/var/logs/app.01.05.error": true,
            ".GitHub/prompts": true,
            "./.tempfile": true
          }), PromptsType.prompt)),
          [
            ".github/prompts",
            "/root/.bashrc",
            "../../folder/.hidden-folder/config.xml",
            "/srv/www/Public_html/.htaccess",
            "../../another.folder/.WEIRD_FILE.log",
            "./folder.name/file.name",
            "/media/external/backup.tar.gz",
            "/Media/external/.secret.backup",
            "../relative/path.to.file",
            "./folderName.with.dots/more.dots.extension",
            "some/folder.with.dots/another.file",
            "/var/logs/app.01.05.error",
            ".GitHub/prompts",
            "./.tempfile"
          ],
          "Must read correct value."
        );
      });
      test("filters out non valid entries", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            "../assets/img/logo.v2.png": true,
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "../.local/bin/script.sh": true,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "../../development/branch.name/some.test": true,
            ".giThub/prompts": true,
            "/Home/user/.ssh/config": true,
            "./hidden.dir/.subhidden": "\f",
            "/tmp/.temp.folder/cache.db": true,
            ".github/prompts": true,
            "/opt/software/v3.2.1/build.log": "  ",
            "": true,
            "./scripts/.old.build.sh": true,
            "/var/data/datafile.2025-02-05.json": "\n",
            "\n\n": true,
            "	": true,
            "\v": true,
            "\f": true,
            "\r\n": true,
            "\f\f": true,
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 2345
          }), PromptsType.prompt)),
          [
            ".github/prompts",
            "../assets/img/logo.v2.png",
            "../.local/bin/script.sh",
            "../../development/branch.name/some.test",
            ".giThub/prompts",
            "/Home/user/.ssh/config",
            "/tmp/.temp.folder/cache.db",
            "./scripts/.old.build.sh"
          ],
          "Must read correct value."
        );
      });
      test("only invalid or false values", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            "../assets/IMG/logo.v2.png": "",
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "./hidden.dir/.subhidden": "\f",
            "/opt/Software/v3.2.1/build.log": "  ",
            "/var/data/datafile.2025-02-05.json": "\n",
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 7654
          }), PromptsType.prompt)),
          [
            ".github/prompts"
          ],
          "Must read correct value."
        );
      });
      test("filters out disabled default location", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/etc/hosts.backup": "	\n	",
            "./run.tests.sh": "\v",
            ".github/prompts": false,
            "../assets/img/logo.v2.png": true,
            "/mnt/storage/video.archive/episode.01.mkv": false,
            "../.local/bin/script.sh": true,
            "/usr/local/share/.fonts/CustomFont.otf": "",
            "../../development/branch.name/some.test": true,
            ".giThub/prompts": true,
            "/Home/user/.ssh/config": true,
            "./hidden.dir/.subhidden": "\f",
            "/tmp/.temp.folder/cache.db": true,
            "/opt/software/v3.2.1/build.log": "  ",
            "": true,
            "./scripts/.old.build.sh": true,
            "/var/data/datafile.2025-02-05.json": "\n",
            "\n\n": true,
            "	": true,
            "\v": true,
            "\f": true,
            "\r\n": true,
            "\f\f": true,
            "../lib/some_library.v1.0.1.so": "\r\n",
            "/dev/shm/.shared_resource": 853
          }), PromptsType.prompt)),
          [
            "../assets/img/logo.v2.png",
            "../.local/bin/script.sh",
            "../../development/branch.name/some.test",
            ".giThub/prompts",
            "/Home/user/.ssh/config",
            "/tmp/.temp.folder/cache.db",
            "./scripts/.old.build.sh"
          ],
          "Must read correct value."
        );
      });
    });
    suite("skills", () => {
      test("undefined returns empty array", () => {
        const configService = createMock(void 0);
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.skill)),
          [],
          "Must return empty array for undefined config."
        );
      });
      test("null returns empty array", () => {
        const configService = createMock(null);
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(configService, PromptsType.skill)),
          [],
          "Must return empty array for null config."
        );
      });
      test("empty object returns default skill folders", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({}), PromptsType.skill)),
          [".agents/skills", ".github/skills", ".claude/skills", "~/.agents/skills", "~/.copilot/skills", "~/.claude/skills"],
          "Must return default skill folders."
        );
      });
      test("includes custom skill folders", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/custom/skills": true,
            "./local/skills": true
          }), PromptsType.skill)),
          [
            ".agents/skills",
            ".github/skills",
            ".claude/skills",
            "~/.agents/skills",
            "~/.copilot/skills",
            "~/.claude/skills",
            "/custom/skills",
            "./local/skills"
          ],
          "Must include custom skill folders."
        );
      });
      test("filters out disabled default skill folders", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            ".github/skills": false,
            "/custom/skills": true
          }), PromptsType.skill)),
          [
            ".agents/skills",
            ".claude/skills",
            "~/.agents/skills",
            "~/.copilot/skills",
            "~/.claude/skills",
            "/custom/skills"
          ],
          "Must filter out disabled .github/skills folder."
        );
      });
      test("filters out all disabled default skill folders", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            ".github/skills": false,
            ".agents/skills": false,
            ".claude/skills": false,
            "~/.copilot/skills": false,
            "~/.agents/skills": false,
            "~/.claude/skills": false,
            "/only/custom/skills": true
          }), PromptsType.skill)),
          [
            "/only/custom/skills"
          ],
          "Must filter out all disabled default folders."
        );
      });
      test("filters out invalid entries", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            "/valid/skills": true,
            "/invalid/path": "	\n",
            "": true,
            "./another/valid": true,
            "\n": true
          }), PromptsType.skill)),
          [
            ".agents/skills",
            ".github/skills",
            ".claude/skills",
            "~/.agents/skills",
            "~/.copilot/skills",
            "~/.claude/skills",
            "/valid/skills",
            "./another/valid"
          ],
          "Must filter out invalid entries."
        );
      });
      test("includes all default folders when explicitly enabled", () => {
        assert.deepStrictEqual(
          getPaths(PromptsConfig.promptSourceFolders(createMock({
            ".github/skills": true,
            ".agents/skills": true,
            ".claude/skills": true,
            "~/.copilot/skills": true,
            "~/.agents/skills": true,
            "~/.claude/skills": true,
            "/extra/skills": true
          }), PromptsType.skill)),
          [
            ".agents/skills",
            ".github/skills",
            ".claude/skills",
            "~/.agents/skills",
            "~/.copilot/skills",
            "~/.claude/skills",
            "/extra/skills"
          ],
          "Must include all default folders."
        );
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9jb25maWcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1vY2tTZXJ2aWNlIH0gZnJvbSAnLi4vdXRpbHMvbW9jay5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvY29uZmlnLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9tcHRTb3VyY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcblxuLyoqXG4gKiBIZWxwZXIgdG8gZXh0cmFjdCBqdXN0IHRoZSBwYXRocyBmcm9tIElQcm9tcHRTb3VyY2VGb2xkZXIgYXJyYXkgZm9yIHRlc3RpbmcuXG4gKi9cbmZ1bmN0aW9uIGdldFBhdGhzKGZvbGRlcnM6IElQcm9tcHRTb3VyY2VGb2xkZXJbXSk6IHN0cmluZ1tdIHtcblx0cmV0dXJuIGZvbGRlcnMubWFwKGYgPT4gZi5wYXRoKTtcbn1cblxuLyoqXG4gKiBNb2NrZWQgaW5zdGFuY2Ugb2Yge0BsaW5rIElDb25maWd1cmF0aW9uU2VydmljZX0uXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZU1vY2s8VD4odmFsdWU6IFQpOiBJQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4gbW9ja1NlcnZpY2U8SUNvbmZpZ3VyYXRpb25TZXJ2aWNlPih7XG5cdFx0Z2V0VmFsdWUoa2V5Pzogc3RyaW5nIHwgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpIHtcblx0XHRcdGFzc2VydChcblx0XHRcdFx0dHlwZW9mIGtleSA9PT0gJ3N0cmluZycsXG5cdFx0XHRcdGBFeHBlY3RlZCBzdHJpbmcgY29uZmlndXJhdGlvbiBrZXksIGdvdCAnJHt0eXBlb2Yga2V5fScuYCxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydChcblx0XHRcdFx0W1Byb21wdHNDb25maWcuUFJPTVBUX0xPQ0FUSU9OU19LRVksIFByb21wdHNDb25maWcuSU5TVFJVQ1RJT05TX0xPQ0FUSU9OX0tFWSwgUHJvbXB0c0NvbmZpZy5NT0RFX0xPQ0FUSU9OX0tFWSwgUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZXS5pbmNsdWRlcyhrZXkpLFxuXHRcdFx0XHRgVW5zdXBwb3J0ZWQgY29uZmlndXJhdGlvbiBrZXkgJyR7a2V5fScuYCxcblx0XHRcdCk7XG5cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9LFxuXHR9KTtcbn1cblxuc3VpdGUoJ1Byb21wdHNDb25maWcnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdnZXRMb2NhdGlvbnNWYWx1ZScsICgpID0+IHtcblx0XHR0ZXN0KCd1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gY3JlYXRlTW9jayh1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY29uZmlnU2VydmljZSwgUHJvbXB0c1R5cGUucHJvbXB0KSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdudWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGNyZWF0ZU1vY2sobnVsbCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0UHJvbXB0c0NvbmZpZy5nZXRMb2NhdGlvbnNWYWx1ZShjb25maWdTZXJ2aWNlLCBQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VuZGVmaW5lZCBmb3Igc2tpbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gY3JlYXRlTW9jayh1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY29uZmlnU2VydmljZSwgUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZSBmb3Igc2tpbGxzLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbnVsbCBmb3Igc2tpbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gY3JlYXRlTW9jayhudWxsKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRQcm9tcHRzQ29uZmlnLmdldExvY2F0aW9uc1ZhbHVlKGNvbmZpZ1NlcnZpY2UsIFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUgZm9yIHNraWxscy4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdlbXB0eScsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRQcm9tcHRzQ29uZmlnLmdldExvY2F0aW9uc1ZhbHVlKGNyZWF0ZU1vY2soe30pLCBQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHRcdHt9LFxuXHRcdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ29ubHkgdmFsaWQgc3RyaW5ncycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRQcm9tcHRzQ29uZmlnLmdldExvY2F0aW9uc1ZhbHVlKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy9yb290Ly5iYXNocmMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2ZvbGRlci8uaGlkZGVuLWZvbGRlci9jb25maWcueG1sJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvc3J2L3d3dy9QdWJsaWNfaHRtbC8uaHRhY2Nlc3MnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2Fub3RoZXIuZm9sZGVyLy5XRUlSRF9GSUxFLmxvZyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9mb2xkZXIubmFtZS9maWxlLm5hbWUnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9tZWRpYS9leHRlcm5hbC9iYWNrdXAudGFyLmd6JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvTWVkaWEvZXh0ZXJuYWwvLnNlY3JldC5iYWNrdXAnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4uL3JlbGF0aXZlL3BhdGgudG8uZmlsZSc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9mb2xkZXJOYW1lLndpdGguZG90cy9tb3JlLmRvdHMuZXh0ZW5zaW9uJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdzb21lL2ZvbGRlci53aXRoLmRvdHMvYW5vdGhlci5maWxlJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvdmFyL2xvZ3MvYXBwLjAxLjA1LmVycm9yJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLy50ZW1wZmlsZSc6IHRydWUsXG5cdFx0XHRcdFx0fSksIFByb21wdHNUeXBlLnByb21wdCksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Jy9yb290Ly5iYXNocmMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2ZvbGRlci8uaGlkZGVuLWZvbGRlci9jb25maWcueG1sJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvc3J2L3d3dy9QdWJsaWNfaHRtbC8uaHRhY2Nlc3MnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2Fub3RoZXIuZm9sZGVyLy5XRUlSRF9GSUxFLmxvZyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9mb2xkZXIubmFtZS9maWxlLm5hbWUnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9tZWRpYS9leHRlcm5hbC9iYWNrdXAudGFyLmd6JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvTWVkaWEvZXh0ZXJuYWwvLnNlY3JldC5iYWNrdXAnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4uL3JlbGF0aXZlL3BhdGgudG8uZmlsZSc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9mb2xkZXJOYW1lLndpdGguZG90cy9tb3JlLmRvdHMuZXh0ZW5zaW9uJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdzb21lL2ZvbGRlci53aXRoLmRvdHMvYW5vdGhlci5maWxlJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvdmFyL2xvZ3MvYXBwLjAxLjA1LmVycm9yJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLy50ZW1wZmlsZSc6IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaWx0ZXJzIG91dCBub24gdmFsaWQgZW50cmllcycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRQcm9tcHRzQ29uZmlnLmdldExvY2F0aW9uc1ZhbHVlKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy9ldGMvaG9zdHMuYmFja3VwJzogJ1xcdFxcblxcdCcsXG5cdFx0XHRcdFx0XHQnLi9ydW4udGVzdHMuc2gnOiAnXFx2Jyxcblx0XHRcdFx0XHRcdCcuLi9hc3NldHMvaW1nL2xvZ28udjIucG5nJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvbW50L3N0b3JhZ2UvdmlkZW8uYXJjaGl2ZS9lcGlzb2RlLjAxLm1rdic6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Jy4uLy5sb2NhbC9iaW4vc2NyaXB0LnNoJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvdXNyL2xvY2FsL3NoYXJlLy5mb250cy9DdXN0b21Gb250Lm90Zic6ICcnLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2RldmVsb3BtZW50L2JyYW5jaC5uYW1lL3NvbWUudGVzdCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL0hvbWUvdXNlci8uc3NoL2NvbmZpZyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9oaWRkZW4uZGlyLy5zdWJoaWRkZW4nOiAnXFxmJyxcblx0XHRcdFx0XHRcdCcvdG1wLy50ZW1wLmZvbGRlci9jYWNoZS5kYic6IHRydWUsXG5cdFx0XHRcdFx0XHQnL29wdC9zb2Z0d2FyZS92My4yLjEvYnVpbGQubG9nJzogJyAgJyxcblx0XHRcdFx0XHRcdCcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vc2NyaXB0cy8ub2xkLmJ1aWxkLnNoJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvdmFyL2RhdGEvZGF0YWZpbGUuMjAyNS0wMi0wNS5qc29uJzogJ1xcbicsXG5cdFx0XHRcdFx0XHQnXFxuXFxuJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXHQnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcdic6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFxmJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXHJcXG4nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcZlxcZic6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vbGliL3NvbWVfbGlicmFyeS52MS4wLjEuc28nOiAnXFxyXFxuJyxcblx0XHRcdFx0XHRcdCcvZGV2L3NobS8uc2hhcmVkX3Jlc291cmNlJzogMTIzNCxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUucHJvbXB0KSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQnLi4vYXNzZXRzL2ltZy9sb2dvLnYyLnBuZyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL21udC9zdG9yYWdlL3ZpZGVvLmFyY2hpdmUvZXBpc29kZS4wMS5ta3YnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCcuLi8ubG9jYWwvYmluL3NjcmlwdC5zaCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZGV2ZWxvcG1lbnQvYnJhbmNoLm5hbWUvc29tZS50ZXN0JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvSG9tZS91c2VyLy5zc2gvY29uZmlnJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvdG1wLy50ZW1wLmZvbGRlci9jYWNoZS5kYic6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9zY3JpcHRzLy5vbGQuYnVpbGQuc2gnOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnb25seSBpbnZhbGlkIG9yIGZhbHNlIHZhbHVlcycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRQcm9tcHRzQ29uZmlnLmdldExvY2F0aW9uc1ZhbHVlKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy9ldGMvaG9zdHMuYmFja3VwJzogJ1xcdFxcblxcdCcsXG5cdFx0XHRcdFx0XHQnLi9ydW4udGVzdHMuc2gnOiAnXFx2Jyxcblx0XHRcdFx0XHRcdCcuLi9hc3NldHMvSU1HL2xvZ28udjIucG5nJzogJycsXG5cdFx0XHRcdFx0XHQnL21udC9zdG9yYWdlL3ZpZGVvLmFyY2hpdmUvZXBpc29kZS4wMS5ta3YnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCcvdXNyL2xvY2FsL3NoYXJlLy5mb250cy9DdXN0b21Gb250Lm90Zic6ICcnLFxuXHRcdFx0XHRcdFx0Jy4vaGlkZGVuLmRpci8uc3ViaGlkZGVuJzogJ1xcZicsXG5cdFx0XHRcdFx0XHQnL29wdC9Tb2Z0d2FyZS92My4yLjEvYnVpbGQubG9nJzogJyAgJyxcblx0XHRcdFx0XHRcdCcvdmFyL2RhdGEvZGF0YWZpbGUuMjAyNS0wMi0wNS5qc29uJzogJ1xcbicsXG5cdFx0XHRcdFx0XHQnLi4vbGliL3NvbWVfbGlicmFyeS52MS4wLjEuc28nOiAnXFxyXFxuJyxcblx0XHRcdFx0XHRcdCcvZGV2L3NobS8uc2hhcmVkX3Jlc291cmNlJzogMjM0NSxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUucHJvbXB0KSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQnL21udC9zdG9yYWdlL3ZpZGVvLmFyY2hpdmUvZXBpc29kZS4wMS5ta3YnOiBmYWxzZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3NraWxsIGxvY2F0aW9ucyAtIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY3JlYXRlTW9jayh7fSksIFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0XHR7fSxcblx0XHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUgZm9yIHNraWxscy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3NraWxsIGxvY2F0aW9ucyAtIHZhbGlkIHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvY3VzdG9tL3NraWxscy9mb2xkZXInOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vcmVsYXRpdmUvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCcuZ2l0aHViL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9jdXN0b20vc2tpbGxzL2ZvbGRlcic6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9yZWxhdGl2ZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHNraWxsIGxvY2F0aW9ucy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3NraWxsIGxvY2F0aW9ucyAtIGZpbHRlcnMgaW52YWxpZCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdFByb21wdHNDb25maWcuZ2V0TG9jYXRpb25zVmFsdWUoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJzogJ1xcdFxcbicsXG5cdFx0XHRcdFx0XHQnL2ludmFsaWQvcGF0aCc6ICcnLFxuXHRcdFx0XHRcdFx0Jyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi92YWxpZC9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcbic6IHRydWUsXG5cdFx0XHRcdFx0fSksIFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vdmFsaWQvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdNdXN0IGZpbHRlciBpbnZhbGlkIHNraWxsIGxvY2F0aW9ucy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzb3VyY2VMb2NhdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgndW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGNyZWF0ZU1vY2sodW5kZWZpbmVkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNvbmZpZ1NlcnZpY2UsIFByb21wdHNUeXBlLnByb21wdCkpLFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlLicsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbnVsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBjcmVhdGVNb2NrKG51bGwpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY29uZmlnU2VydmljZSwgUHJvbXB0c1R5cGUucHJvbXB0KSksXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnb2JqZWN0JywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNyZWF0ZU1vY2soe30pLCBQcm9tcHRzVHlwZS5wcm9tcHQpKSxcblx0XHRcdFx0XHRbJy5naXRodWIvcHJvbXB0cyddLFxuXHRcdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ29ubHkgdmFsaWQgc3RyaW5ncycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnL3Jvb3QvLmJhc2hyYyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZm9sZGVyLy5oaWRkZW4tZm9sZGVyL2NvbmZpZy54bWwnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9zcnYvd3d3L1B1YmxpY19odG1sLy5odGFjY2Vzcyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vLi4vYW5vdGhlci5mb2xkZXIvLldFSVJEX0ZJTEUubG9nJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2ZvbGRlci5uYW1lL2ZpbGUubmFtZSc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL21lZGlhL2V4dGVybmFsL2JhY2t1cC50YXIuZ3onOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9NZWRpYS9leHRlcm5hbC8uc2VjcmV0LmJhY2t1cCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vcmVsYXRpdmUvcGF0aC50by5maWxlJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2ZvbGRlck5hbWUud2l0aC5kb3RzL21vcmUuZG90cy5leHRlbnNpb24nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J3NvbWUvZm9sZGVyLndpdGguZG90cy9hbm90aGVyLmZpbGUnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy92YXIvbG9ncy9hcHAuMDEuMDUuZXJyb3InOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy5HaXRIdWIvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi8udGVtcGZpbGUnOiB0cnVlLFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5wcm9tcHQpKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9wcm9tcHRzJyxcblx0XHRcdFx0XHRcdCcvcm9vdC8uYmFzaHJjJyxcblx0XHRcdFx0XHRcdCcuLi8uLi9mb2xkZXIvLmhpZGRlbi1mb2xkZXIvY29uZmlnLnhtbCcsXG5cdFx0XHRcdFx0XHQnL3Nydi93d3cvUHVibGljX2h0bWwvLmh0YWNjZXNzJyxcblx0XHRcdFx0XHRcdCcuLi8uLi9hbm90aGVyLmZvbGRlci8uV0VJUkRfRklMRS5sb2cnLFxuXHRcdFx0XHRcdFx0Jy4vZm9sZGVyLm5hbWUvZmlsZS5uYW1lJyxcblx0XHRcdFx0XHRcdCcvbWVkaWEvZXh0ZXJuYWwvYmFja3VwLnRhci5neicsXG5cdFx0XHRcdFx0XHQnL01lZGlhL2V4dGVybmFsLy5zZWNyZXQuYmFja3VwJyxcblx0XHRcdFx0XHRcdCcuLi9yZWxhdGl2ZS9wYXRoLnRvLmZpbGUnLFxuXHRcdFx0XHRcdFx0Jy4vZm9sZGVyTmFtZS53aXRoLmRvdHMvbW9yZS5kb3RzLmV4dGVuc2lvbicsXG5cdFx0XHRcdFx0XHQnc29tZS9mb2xkZXIud2l0aC5kb3RzL2Fub3RoZXIuZmlsZScsXG5cdFx0XHRcdFx0XHQnL3Zhci9sb2dzL2FwcC4wMS4wNS5lcnJvcicsXG5cdFx0XHRcdFx0XHQnLkdpdEh1Yi9wcm9tcHRzJyxcblx0XHRcdFx0XHRcdCcuLy50ZW1wZmlsZScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaWx0ZXJzIG91dCBub24gdmFsaWQgZW50cmllcycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnL2V0Yy9ob3N0cy5iYWNrdXAnOiAnXFx0XFxuXFx0Jyxcblx0XHRcdFx0XHRcdCcuL3J1bi50ZXN0cy5zaCc6ICdcXHYnLFxuXHRcdFx0XHRcdFx0Jy4uL2Fzc2V0cy9pbWcvbG9nby52Mi5wbmcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9tbnQvc3RvcmFnZS92aWRlby5hcmNoaXZlL2VwaXNvZGUuMDEubWt2JzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnLi4vLmxvY2FsL2Jpbi9zY3JpcHQuc2gnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy91c3IvbG9jYWwvc2hhcmUvLmZvbnRzL0N1c3RvbUZvbnQub3RmJzogJycsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZGV2ZWxvcG1lbnQvYnJhbmNoLm5hbWUvc29tZS50ZXN0JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuZ2lUaHViL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9Ib21lL3VzZXIvLnNzaC9jb25maWcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vaGlkZGVuLmRpci8uc3ViaGlkZGVuJzogJ1xcZicsXG5cdFx0XHRcdFx0XHQnL3RtcC8udGVtcC5mb2xkZXIvY2FjaGUuZGInOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy5naXRodWIvcHJvbXB0cyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnL29wdC9zb2Z0d2FyZS92My4yLjEvYnVpbGQubG9nJzogJyAgJyxcblx0XHRcdFx0XHRcdCcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vc2NyaXB0cy8ub2xkLmJ1aWxkLnNoJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvdmFyL2RhdGEvZGF0YWZpbGUuMjAyNS0wMi0wNS5qc29uJzogJ1xcbicsXG5cdFx0XHRcdFx0XHQnXFxuXFxuJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXHQnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcdic6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFxmJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXHJcXG4nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcZlxcZic6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi4vbGliL3NvbWVfbGlicmFyeS52MS4wLjEuc28nOiAnXFxyXFxuJyxcblx0XHRcdFx0XHRcdCcvZGV2L3NobS8uc2hhcmVkX3Jlc291cmNlJzogMjM0NSxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUucHJvbXB0KSksXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Jy5naXRodWIvcHJvbXB0cycsXG5cdFx0XHRcdFx0XHQnLi4vYXNzZXRzL2ltZy9sb2dvLnYyLnBuZycsXG5cdFx0XHRcdFx0XHQnLi4vLmxvY2FsL2Jpbi9zY3JpcHQuc2gnLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2RldmVsb3BtZW50L2JyYW5jaC5uYW1lL3NvbWUudGVzdCcsXG5cdFx0XHRcdFx0XHQnLmdpVGh1Yi9wcm9tcHRzJyxcblx0XHRcdFx0XHRcdCcvSG9tZS91c2VyLy5zc2gvY29uZmlnJyxcblx0XHRcdFx0XHRcdCcvdG1wLy50ZW1wLmZvbGRlci9jYWNoZS5kYicsXG5cdFx0XHRcdFx0XHQnLi9zY3JpcHRzLy5vbGQuYnVpbGQuc2gnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgcmVhZCBjb3JyZWN0IHZhbHVlLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnb25seSBpbnZhbGlkIG9yIGZhbHNlIHZhbHVlcycsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRnZXRQYXRocyhQcm9tcHRzQ29uZmlnLnByb21wdFNvdXJjZUZvbGRlcnMoY3JlYXRlTW9jayh7XG5cdFx0XHRcdFx0XHQnL2V0Yy9ob3N0cy5iYWNrdXAnOiAnXFx0XFxuXFx0Jyxcblx0XHRcdFx0XHRcdCcuL3J1bi50ZXN0cy5zaCc6ICdcXHYnLFxuXHRcdFx0XHRcdFx0Jy4uL2Fzc2V0cy9JTUcvbG9nby52Mi5wbmcnOiAnJyxcblx0XHRcdFx0XHRcdCcvbW50L3N0b3JhZ2UvdmlkZW8uYXJjaGl2ZS9lcGlzb2RlLjAxLm1rdic6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Jy91c3IvbG9jYWwvc2hhcmUvLmZvbnRzL0N1c3RvbUZvbnQub3RmJzogJycsXG5cdFx0XHRcdFx0XHQnLi9oaWRkZW4uZGlyLy5zdWJoaWRkZW4nOiAnXFxmJyxcblx0XHRcdFx0XHRcdCcvb3B0L1NvZnR3YXJlL3YzLjIuMS9idWlsZC5sb2cnOiAnICAnLFxuXHRcdFx0XHRcdFx0Jy92YXIvZGF0YS9kYXRhZmlsZS4yMDI1LTAyLTA1Lmpzb24nOiAnXFxuJyxcblx0XHRcdFx0XHRcdCcuLi9saWIvc29tZV9saWJyYXJ5LnYxLjAuMS5zbyc6ICdcXHJcXG4nLFxuXHRcdFx0XHRcdFx0Jy9kZXYvc2htLy5zaGFyZWRfcmVzb3VyY2UnOiA3NjU0LFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5wcm9tcHQpKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9wcm9tcHRzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IHJlYWQgY29ycmVjdCB2YWx1ZS4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IGRpc2FibGVkIGRlZmF1bHQgbG9jYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy9ldGMvaG9zdHMuYmFja3VwJzogJ1xcdFxcblxcdCcsXG5cdFx0XHRcdFx0XHQnLi9ydW4udGVzdHMuc2gnOiAnXFx2Jyxcblx0XHRcdFx0XHRcdCcuZ2l0aHViL3Byb21wdHMnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCcuLi9hc3NldHMvaW1nL2xvZ28udjIucG5nJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvbW50L3N0b3JhZ2UvdmlkZW8uYXJjaGl2ZS9lcGlzb2RlLjAxLm1rdic6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Jy4uLy5sb2NhbC9iaW4vc2NyaXB0LnNoJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvdXNyL2xvY2FsL3NoYXJlLy5mb250cy9DdXN0b21Gb250Lm90Zic6ICcnLFxuXHRcdFx0XHRcdFx0Jy4uLy4uL2RldmVsb3BtZW50L2JyYW5jaC5uYW1lL3NvbWUudGVzdCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLmdpVGh1Yi9wcm9tcHRzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvSG9tZS91c2VyLy5zc2gvY29uZmlnJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuL2hpZGRlbi5kaXIvLnN1YmhpZGRlbic6ICdcXGYnLFxuXHRcdFx0XHRcdFx0Jy90bXAvLnRlbXAuZm9sZGVyL2NhY2hlLmRiJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvb3B0L3NvZnR3YXJlL3YzLjIuMS9idWlsZC5sb2cnOiAnICAnLFxuXHRcdFx0XHRcdFx0Jyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9zY3JpcHRzLy5vbGQuYnVpbGQuc2gnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy92YXIvZGF0YS9kYXRhZmlsZS4yMDI1LTAyLTA1Lmpzb24nOiAnXFxuJyxcblx0XHRcdFx0XHRcdCdcXG5cXG4nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcdCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFx2JzogdHJ1ZSxcblx0XHRcdFx0XHRcdCdcXGYnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J1xcclxcbic6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFxmXFxmJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuLi9saWIvc29tZV9saWJyYXJ5LnYxLjAuMS5zbyc6ICdcXHJcXG4nLFxuXHRcdFx0XHRcdFx0Jy9kZXYvc2htLy5zaGFyZWRfcmVzb3VyY2UnOiA4NTMsXG5cdFx0XHRcdFx0fSksIFByb21wdHNUeXBlLnByb21wdCkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcuLi9hc3NldHMvaW1nL2xvZ28udjIucG5nJyxcblx0XHRcdFx0XHRcdCcuLi8ubG9jYWwvYmluL3NjcmlwdC5zaCcsXG5cdFx0XHRcdFx0XHQnLi4vLi4vZGV2ZWxvcG1lbnQvYnJhbmNoLm5hbWUvc29tZS50ZXN0Jyxcblx0XHRcdFx0XHRcdCcuZ2lUaHViL3Byb21wdHMnLFxuXHRcdFx0XHRcdFx0Jy9Ib21lL3VzZXIvLnNzaC9jb25maWcnLFxuXHRcdFx0XHRcdFx0Jy90bXAvLnRlbXAuZm9sZGVyL2NhY2hlLmRiJyxcblx0XHRcdFx0XHRcdCcuL3NjcmlwdHMvLm9sZC5idWlsZC5zaCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCByZWFkIGNvcnJlY3QgdmFsdWUuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3NraWxscycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3VuZGVmaW5lZCByZXR1cm5zIGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gY3JlYXRlTW9jayh1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNvbmZpZ1NlcnZpY2UsIFByb21wdHNUeXBlLnNraWxsKSksXG5cdFx0XHRcdFx0W10sXG5cdFx0XHRcdFx0J011c3QgcmV0dXJuIGVtcHR5IGFycmF5IGZvciB1bmRlZmluZWQgY29uZmlnLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbnVsbCByZXR1cm5zIGVtcHR5IGFycmF5JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gY3JlYXRlTW9jayhudWxsKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGdldFBhdGhzKFByb21wdHNDb25maWcucHJvbXB0U291cmNlRm9sZGVycyhjb25maWdTZXJ2aWNlLCBQcm9tcHRzVHlwZS5za2lsbCkpLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdCdNdXN0IHJldHVybiBlbXB0eSBhcnJheSBmb3IgbnVsbCBjb25maWcuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlbXB0eSBvYmplY3QgcmV0dXJucyBkZWZhdWx0IHNraWxsIGZvbGRlcnMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNyZWF0ZU1vY2soe30pLCBQcm9tcHRzVHlwZS5za2lsbCkpLFxuXHRcdFx0XHRcdFsnLmFnZW50cy9za2lsbHMnLCAnLmdpdGh1Yi9za2lsbHMnLCAnLmNsYXVkZS9za2lsbHMnLCAnfi8uYWdlbnRzL3NraWxscycsICd+Ly5jb3BpbG90L3NraWxscycsICd+Ly5jbGF1ZGUvc2tpbGxzJ10sXG5cdFx0XHRcdFx0J011c3QgcmV0dXJuIGRlZmF1bHQgc2tpbGwgZm9sZGVycy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY2x1ZGVzIGN1c3RvbSBza2lsbCBmb2xkZXJzJywgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdGdldFBhdGhzKFByb21wdHNDb25maWcucHJvbXB0U291cmNlRm9sZGVycyhjcmVhdGVNb2NrKHtcblx0XHRcdFx0XHRcdCcvY3VzdG9tL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLi9sb2NhbC9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5za2lsbCkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnLmdpdGh1Yi9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCd+Ly5jb3BpbG90L3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQnL2N1c3RvbS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy4vbG9jYWwvc2tpbGxzJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdCdNdXN0IGluY2x1ZGUgY3VzdG9tIHNraWxsIGZvbGRlcnMuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaWx0ZXJzIG91dCBkaXNhYmxlZCBkZWZhdWx0IHNraWxsIGZvbGRlcnMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnL2N1c3RvbS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdH0pLCBQcm9tcHRzVHlwZS5za2lsbCkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0J34vLmFnZW50cy9za2lsbHMnLFxuXHRcdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcvY3VzdG9tL3NraWxscycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaWx0ZXIgb3V0IGRpc2FibGVkIC5naXRodWIvc2tpbGxzIGZvbGRlci4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IGFsbCBkaXNhYmxlZCBkZWZhdWx0IHNraWxsIGZvbGRlcnMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogZmFsc2UsXG5cdFx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscyc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnOiBmYWxzZSxcblx0XHRcdFx0XHRcdCcvb25seS9jdXN0b20vc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUuc2tpbGwpKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnL29ubHkvY3VzdG9tL3NraWxscycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaWx0ZXIgb3V0IGFsbCBkaXNhYmxlZCBkZWZhdWx0IGZvbGRlcnMuJyxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaWx0ZXJzIG91dCBpbnZhbGlkIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy92YWxpZC9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy9pbnZhbGlkL3BhdGgnOiAnXFx0XFxuJyxcblx0XHRcdFx0XHRcdCcnOiB0cnVlLFxuXHRcdFx0XHRcdFx0Jy4vYW5vdGhlci92YWxpZCc6IHRydWUsXG5cdFx0XHRcdFx0XHQnXFxuJzogdHJ1ZSxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUuc2tpbGwpKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnLFxuXHRcdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy92YWxpZC9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy4vYW5vdGhlci92YWxpZCcsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnTXVzdCBmaWx0ZXIgb3V0IGludmFsaWQgZW50cmllcy4nLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY2x1ZGVzIGFsbCBkZWZhdWx0IGZvbGRlcnMgd2hlbiBleHBsaWNpdGx5IGVuYWJsZWQnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0Z2V0UGF0aHMoUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKGNyZWF0ZU1vY2soe1xuXHRcdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcuYWdlbnRzL3NraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0XHQnLmNsYXVkZS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0J34vLmNvcGlsb3Qvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCd+Ly5hZ2VudHMvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCd+Ly5jbGF1ZGUvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHRcdCcvZXh0cmEvc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHR9KSwgUHJvbXB0c1R5cGUuc2tpbGwpKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHQnLmFnZW50cy9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy5naXRodWIvc2tpbGxzJyxcblx0XHRcdFx0XHRcdCcuY2xhdWRlL3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uYWdlbnRzL3NraWxscycsXG5cdFx0XHRcdFx0XHQnfi8uY29waWxvdC9za2lsbHMnLFxuXHRcdFx0XHRcdFx0J34vLmNsYXVkZS9za2lsbHMnLFxuXHRcdFx0XHRcdFx0Jy9leHRyYS9za2lsbHMnLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0J011c3QgaW5jbHVkZSBhbGwgZGVmYXVsdCBmb2xkZXJzLicsXG5cdFx0XHRcdCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLCtDQUErQztBQU94RCxTQUFTLFNBQVMsU0FBMEM7QUFDM0QsU0FBTyxRQUFRLElBQUksT0FBSyxFQUFFLElBQUk7QUFDL0I7QUFLQSxTQUFTLFdBQWMsT0FBaUM7QUFDdkQsU0FBTyxZQUFtQztBQUFBLElBQ3pDLFNBQVMsS0FBd0M7QUFDaEQ7QUFBQSxRQUNDLE9BQU8sUUFBUTtBQUFBLFFBQ2YsMkNBQTJDLE9BQU8sR0FBRztBQUFBLE1BQ3REO0FBRUE7QUFBQSxRQUNDLENBQUMsY0FBYyxzQkFBc0IsY0FBYywyQkFBMkIsY0FBYyxtQkFBbUIsY0FBYyxtQkFBbUIsRUFBRSxTQUFTLEdBQUc7QUFBQSxRQUM5SixrQ0FBa0MsR0FBRztBQUFBLE1BQ3RDO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNELENBQUM7QUFDRjtBQUVBLE1BQU0saUJBQWlCLE1BQU07QUFDNUIsMENBQXdDO0FBRXhDLFFBQU0scUJBQXFCLE1BQU07QUFDaEMsU0FBSyxhQUFhLE1BQU07QUFDdkIsWUFBTSxnQkFBZ0IsV0FBVyxNQUFTO0FBRTFDLGFBQU87QUFBQSxRQUNOLGNBQWMsa0JBQWtCLGVBQWUsWUFBWSxNQUFNO0FBQUEsUUFDakU7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssUUFBUSxNQUFNO0FBQ2xCLFlBQU0sZ0JBQWdCLFdBQVcsSUFBSTtBQUVyQyxhQUFPO0FBQUEsUUFDTixjQUFjLGtCQUFrQixlQUFlLFlBQVksTUFBTTtBQUFBLFFBQ2pFO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHVCQUF1QixNQUFNO0FBQ2pDLFlBQU0sZ0JBQWdCLFdBQVcsTUFBUztBQUUxQyxhQUFPO0FBQUEsUUFDTixjQUFjLGtCQUFrQixlQUFlLFlBQVksS0FBSztBQUFBLFFBQ2hFO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGtCQUFrQixNQUFNO0FBQzVCLFlBQU0sZ0JBQWdCLFdBQVcsSUFBSTtBQUVyQyxhQUFPO0FBQUEsUUFDTixjQUFjLGtCQUFrQixlQUFlLFlBQVksS0FBSztBQUFBLFFBQ2hFO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFVBQVUsTUFBTTtBQUNyQixXQUFLLFNBQVMsTUFBTTtBQUNuQixlQUFPO0FBQUEsVUFDTixjQUFjLGtCQUFrQixXQUFXLENBQUMsQ0FBQyxHQUFHLFlBQVksTUFBTTtBQUFBLFVBQ2xFLENBQUM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssc0JBQXNCLE1BQU07QUFDaEMsZUFBTztBQUFBLFVBQ04sY0FBYyxrQkFBa0IsV0FBVztBQUFBLFlBQzFDLGlCQUFpQjtBQUFBLFlBQ2pCLDBDQUEwQztBQUFBLFlBQzFDLGtDQUFrQztBQUFBLFlBQ2xDLHdDQUF3QztBQUFBLFlBQ3hDLDJCQUEyQjtBQUFBLFlBQzNCLGlDQUFpQztBQUFBLFlBQ2pDLGtDQUFrQztBQUFBLFlBQ2xDLDRCQUE0QjtBQUFBLFlBQzVCLDhDQUE4QztBQUFBLFlBQzlDLHNDQUFzQztBQUFBLFlBQ3RDLDZCQUE2QjtBQUFBLFlBQzdCLGVBQWU7QUFBQSxVQUNoQixDQUFDLEdBQUcsWUFBWSxNQUFNO0FBQUEsVUFDdEI7QUFBQSxZQUNDLGlCQUFpQjtBQUFBLFlBQ2pCLDBDQUEwQztBQUFBLFlBQzFDLGtDQUFrQztBQUFBLFlBQ2xDLHdDQUF3QztBQUFBLFlBQ3hDLDJCQUEyQjtBQUFBLFlBQzNCLGlDQUFpQztBQUFBLFlBQ2pDLGtDQUFrQztBQUFBLFlBQ2xDLDRCQUE0QjtBQUFBLFlBQzVCLDhDQUE4QztBQUFBLFlBQzlDLHNDQUFzQztBQUFBLFlBQ3RDLDZCQUE2QjtBQUFBLFlBQzdCLGVBQWU7QUFBQSxVQUNoQjtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxlQUFPO0FBQUEsVUFDTixjQUFjLGtCQUFrQixXQUFXO0FBQUEsWUFDMUMscUJBQXFCO0FBQUEsWUFDckIsa0JBQWtCO0FBQUEsWUFDbEIsNkJBQTZCO0FBQUEsWUFDN0IsNkNBQTZDO0FBQUEsWUFDN0MsMkJBQTJCO0FBQUEsWUFDM0IsMENBQTBDO0FBQUEsWUFDMUMsMkNBQTJDO0FBQUEsWUFDM0MsMEJBQTBCO0FBQUEsWUFDMUIsMkJBQTJCO0FBQUEsWUFDM0IsOEJBQThCO0FBQUEsWUFDOUIsa0NBQWtDO0FBQUEsWUFDbEMsSUFBSTtBQUFBLFlBQ0osMkJBQTJCO0FBQUEsWUFDM0Isc0NBQXNDO0FBQUEsWUFDdEMsUUFBUTtBQUFBLFlBQ1IsS0FBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sUUFBUTtBQUFBLFlBQ1IsUUFBUTtBQUFBLFlBQ1IsaUNBQWlDO0FBQUEsWUFDakMsNkJBQTZCO0FBQUEsVUFDOUIsQ0FBQyxHQUFHLFlBQVksTUFBTTtBQUFBLFVBQ3RCO0FBQUEsWUFDQyw2QkFBNkI7QUFBQSxZQUM3Qiw2Q0FBNkM7QUFBQSxZQUM3QywyQkFBMkI7QUFBQSxZQUMzQiwyQ0FBMkM7QUFBQSxZQUMzQywwQkFBMEI7QUFBQSxZQUMxQiw4QkFBOEI7QUFBQSxZQUM5QiwyQkFBMkI7QUFBQSxVQUM1QjtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxnQ0FBZ0MsTUFBTTtBQUMxQyxlQUFPO0FBQUEsVUFDTixjQUFjLGtCQUFrQixXQUFXO0FBQUEsWUFDMUMscUJBQXFCO0FBQUEsWUFDckIsa0JBQWtCO0FBQUEsWUFDbEIsNkJBQTZCO0FBQUEsWUFDN0IsNkNBQTZDO0FBQUEsWUFDN0MsMENBQTBDO0FBQUEsWUFDMUMsMkJBQTJCO0FBQUEsWUFDM0Isa0NBQWtDO0FBQUEsWUFDbEMsc0NBQXNDO0FBQUEsWUFDdEMsaUNBQWlDO0FBQUEsWUFDakMsNkJBQTZCO0FBQUEsVUFDOUIsQ0FBQyxHQUFHLFlBQVksTUFBTTtBQUFBLFVBQ3RCO0FBQUEsWUFDQyw2Q0FBNkM7QUFBQSxVQUM5QztBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSywyQkFBMkIsTUFBTTtBQUNyQyxlQUFPO0FBQUEsVUFDTixjQUFjLGtCQUFrQixXQUFXLENBQUMsQ0FBQyxHQUFHLFlBQVksS0FBSztBQUFBLFVBQ2pFLENBQUM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssaUNBQWlDLE1BQU07QUFDM0MsZUFBTztBQUFBLFVBQ04sY0FBYyxrQkFBa0IsV0FBVztBQUFBLFlBQzFDLGtCQUFrQjtBQUFBLFlBQ2xCLGtCQUFrQjtBQUFBLFlBQ2xCLHlCQUF5QjtBQUFBLFlBQ3pCLHFCQUFxQjtBQUFBLFVBQ3RCLENBQUMsR0FBRyxZQUFZLEtBQUs7QUFBQSxVQUNyQjtBQUFBLFlBQ0Msa0JBQWtCO0FBQUEsWUFDbEIsa0JBQWtCO0FBQUEsWUFDbEIseUJBQXlCO0FBQUEsWUFDekIscUJBQXFCO0FBQUEsVUFDdEI7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssNkNBQTZDLE1BQU07QUFDdkQsZUFBTztBQUFBLFVBQ04sY0FBYyxrQkFBa0IsV0FBVztBQUFBLFlBQzFDLGtCQUFrQjtBQUFBLFlBQ2xCLGtCQUFrQjtBQUFBLFlBQ2xCLGlCQUFpQjtBQUFBLFlBQ2pCLElBQUk7QUFBQSxZQUNKLGtCQUFrQjtBQUFBLFlBQ2xCLE1BQU07QUFBQSxVQUNQLENBQUMsR0FBRyxZQUFZLEtBQUs7QUFBQSxVQUNyQjtBQUFBLFlBQ0Msa0JBQWtCO0FBQUEsWUFDbEIsa0JBQWtCO0FBQUEsVUFDbkI7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sbUJBQW1CLE1BQU07QUFDOUIsU0FBSyxhQUFhLE1BQU07QUFDdkIsWUFBTSxnQkFBZ0IsV0FBVyxNQUFTO0FBRTFDLGFBQU87QUFBQSxRQUNOLFNBQVMsY0FBYyxvQkFBb0IsZUFBZSxZQUFZLE1BQU0sQ0FBQztBQUFBLFFBQzdFLENBQUM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssUUFBUSxNQUFNO0FBQ2xCLFlBQU0sZ0JBQWdCLFdBQVcsSUFBSTtBQUVyQyxhQUFPO0FBQUEsUUFDTixTQUFTLGNBQWMsb0JBQW9CLGVBQWUsWUFBWSxNQUFNLENBQUM7QUFBQSxRQUM3RSxDQUFDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFVBQVUsTUFBTTtBQUNyQixXQUFLLFNBQVMsTUFBTTtBQUNuQixlQUFPO0FBQUEsVUFDTixTQUFTLGNBQWMsb0JBQW9CLFdBQVcsQ0FBQyxDQUFDLEdBQUcsWUFBWSxNQUFNLENBQUM7QUFBQSxVQUM5RSxDQUFDLGlCQUFpQjtBQUFBLFVBQ2xCO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssc0JBQXNCLE1BQU07QUFDaEMsZUFBTztBQUFBLFVBQ04sU0FBUyxjQUFjLG9CQUFvQixXQUFXO0FBQUEsWUFDckQsaUJBQWlCO0FBQUEsWUFDakIsMENBQTBDO0FBQUEsWUFDMUMsa0NBQWtDO0FBQUEsWUFDbEMsd0NBQXdDO0FBQUEsWUFDeEMsMkJBQTJCO0FBQUEsWUFDM0IsaUNBQWlDO0FBQUEsWUFDakMsa0NBQWtDO0FBQUEsWUFDbEMsNEJBQTRCO0FBQUEsWUFDNUIsOENBQThDO0FBQUEsWUFDOUMsc0NBQXNDO0FBQUEsWUFDdEMsNkJBQTZCO0FBQUEsWUFDN0IsbUJBQW1CO0FBQUEsWUFDbkIsZUFBZTtBQUFBLFVBQ2hCLENBQUMsR0FBRyxZQUFZLE1BQU0sQ0FBQztBQUFBLFVBQ3ZCO0FBQUEsWUFDQztBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLGlDQUFpQyxNQUFNO0FBQzNDLGVBQU87QUFBQSxVQUNOLFNBQVMsY0FBYyxvQkFBb0IsV0FBVztBQUFBLFlBQ3JELHFCQUFxQjtBQUFBLFlBQ3JCLGtCQUFrQjtBQUFBLFlBQ2xCLDZCQUE2QjtBQUFBLFlBQzdCLDZDQUE2QztBQUFBLFlBQzdDLDJCQUEyQjtBQUFBLFlBQzNCLDBDQUEwQztBQUFBLFlBQzFDLDJDQUEyQztBQUFBLFlBQzNDLG1CQUFtQjtBQUFBLFlBQ25CLDBCQUEwQjtBQUFBLFlBQzFCLDJCQUEyQjtBQUFBLFlBQzNCLDhCQUE4QjtBQUFBLFlBQzlCLG1CQUFtQjtBQUFBLFlBQ25CLGtDQUFrQztBQUFBLFlBQ2xDLElBQUk7QUFBQSxZQUNKLDJCQUEyQjtBQUFBLFlBQzNCLHNDQUFzQztBQUFBLFlBQ3RDLFFBQVE7QUFBQSxZQUNSLEtBQU07QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLFFBQVE7QUFBQSxZQUNSLFFBQVE7QUFBQSxZQUNSLGlDQUFpQztBQUFBLFlBQ2pDLDZCQUE2QjtBQUFBLFVBQzlCLENBQUMsR0FBRyxZQUFZLE1BQU0sQ0FBQztBQUFBLFVBQ3ZCO0FBQUEsWUFDQztBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxXQUFLLGdDQUFnQyxNQUFNO0FBQzFDLGVBQU87QUFBQSxVQUNOLFNBQVMsY0FBYyxvQkFBb0IsV0FBVztBQUFBLFlBQ3JELHFCQUFxQjtBQUFBLFlBQ3JCLGtCQUFrQjtBQUFBLFlBQ2xCLDZCQUE2QjtBQUFBLFlBQzdCLDZDQUE2QztBQUFBLFlBQzdDLDBDQUEwQztBQUFBLFlBQzFDLDJCQUEyQjtBQUFBLFlBQzNCLGtDQUFrQztBQUFBLFlBQ2xDLHNDQUFzQztBQUFBLFlBQ3RDLGlDQUFpQztBQUFBLFlBQ2pDLDZCQUE2QjtBQUFBLFVBQzlCLENBQUMsR0FBRyxZQUFZLE1BQU0sQ0FBQztBQUFBLFVBQ3ZCO0FBQUEsWUFDQztBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUsseUNBQXlDLE1BQU07QUFDbkQsZUFBTztBQUFBLFVBQ04sU0FBUyxjQUFjLG9CQUFvQixXQUFXO0FBQUEsWUFDckQscUJBQXFCO0FBQUEsWUFDckIsa0JBQWtCO0FBQUEsWUFDbEIsbUJBQW1CO0FBQUEsWUFDbkIsNkJBQTZCO0FBQUEsWUFDN0IsNkNBQTZDO0FBQUEsWUFDN0MsMkJBQTJCO0FBQUEsWUFDM0IsMENBQTBDO0FBQUEsWUFDMUMsMkNBQTJDO0FBQUEsWUFDM0MsbUJBQW1CO0FBQUEsWUFDbkIsMEJBQTBCO0FBQUEsWUFDMUIsMkJBQTJCO0FBQUEsWUFDM0IsOEJBQThCO0FBQUEsWUFDOUIsa0NBQWtDO0FBQUEsWUFDbEMsSUFBSTtBQUFBLFlBQ0osMkJBQTJCO0FBQUEsWUFDM0Isc0NBQXNDO0FBQUEsWUFDdEMsUUFBUTtBQUFBLFlBQ1IsS0FBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sUUFBUTtBQUFBLFlBQ1IsUUFBUTtBQUFBLFlBQ1IsaUNBQWlDO0FBQUEsWUFDakMsNkJBQTZCO0FBQUEsVUFDOUIsQ0FBQyxHQUFHLFlBQVksTUFBTSxDQUFDO0FBQUEsVUFDdkI7QUFBQSxZQUNDO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxVQUFVLE1BQU07QUFDckIsV0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxjQUFNLGdCQUFnQixXQUFXLE1BQVM7QUFFMUMsZUFBTztBQUFBLFVBQ04sU0FBUyxjQUFjLG9CQUFvQixlQUFlLFlBQVksS0FBSyxDQUFDO0FBQUEsVUFDNUUsQ0FBQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyw0QkFBNEIsTUFBTTtBQUN0QyxjQUFNLGdCQUFnQixXQUFXLElBQUk7QUFFckMsZUFBTztBQUFBLFVBQ04sU0FBUyxjQUFjLG9CQUFvQixlQUFlLFlBQVksS0FBSyxDQUFDO0FBQUEsVUFDNUUsQ0FBQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxlQUFPO0FBQUEsVUFDTixTQUFTLGNBQWMsb0JBQW9CLFdBQVcsQ0FBQyxDQUFDLEdBQUcsWUFBWSxLQUFLLENBQUM7QUFBQSxVQUM3RSxDQUFDLGtCQUFrQixrQkFBa0Isa0JBQWtCLG9CQUFvQixxQkFBcUIsa0JBQWtCO0FBQUEsVUFDbEg7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxlQUFPO0FBQUEsVUFDTixTQUFTLGNBQWMsb0JBQW9CLFdBQVc7QUFBQSxZQUNyRCxrQkFBa0I7QUFBQSxZQUNsQixrQkFBa0I7QUFBQSxVQUNuQixDQUFDLEdBQUcsWUFBWSxLQUFLLENBQUM7QUFBQSxVQUN0QjtBQUFBLFlBQ0M7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxlQUFPO0FBQUEsVUFDTixTQUFTLGNBQWMsb0JBQW9CLFdBQVc7QUFBQSxZQUNyRCxrQkFBa0I7QUFBQSxZQUNsQixrQkFBa0I7QUFBQSxVQUNuQixDQUFDLEdBQUcsWUFBWSxLQUFLLENBQUM7QUFBQSxVQUN0QjtBQUFBLFlBQ0M7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUVELFdBQUssa0RBQWtELE1BQU07QUFDNUQsZUFBTztBQUFBLFVBQ04sU0FBUyxjQUFjLG9CQUFvQixXQUFXO0FBQUEsWUFDckQsa0JBQWtCO0FBQUEsWUFDbEIsa0JBQWtCO0FBQUEsWUFDbEIsa0JBQWtCO0FBQUEsWUFDbEIscUJBQXFCO0FBQUEsWUFDckIsb0JBQW9CO0FBQUEsWUFDcEIsb0JBQW9CO0FBQUEsWUFDcEIsdUJBQXVCO0FBQUEsVUFDeEIsQ0FBQyxHQUFHLFlBQVksS0FBSyxDQUFDO0FBQUEsVUFDdEI7QUFBQSxZQUNDO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSywrQkFBK0IsTUFBTTtBQUN6QyxlQUFPO0FBQUEsVUFDTixTQUFTLGNBQWMsb0JBQW9CLFdBQVc7QUFBQSxZQUNyRCxpQkFBaUI7QUFBQSxZQUNqQixpQkFBaUI7QUFBQSxZQUNqQixJQUFJO0FBQUEsWUFDSixtQkFBbUI7QUFBQSxZQUNuQixNQUFNO0FBQUEsVUFDUCxDQUFDLEdBQUcsWUFBWSxLQUFLLENBQUM7QUFBQSxVQUN0QjtBQUFBLFlBQ0M7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyx3REFBd0QsTUFBTTtBQUNsRSxlQUFPO0FBQUEsVUFDTixTQUFTLGNBQWMsb0JBQW9CLFdBQVc7QUFBQSxZQUNyRCxrQkFBa0I7QUFBQSxZQUNsQixrQkFBa0I7QUFBQSxZQUNsQixrQkFBa0I7QUFBQSxZQUNsQixxQkFBcUI7QUFBQSxZQUNyQixvQkFBb0I7QUFBQSxZQUNwQixvQkFBb0I7QUFBQSxZQUNwQixpQkFBaUI7QUFBQSxVQUNsQixDQUFDLEdBQUcsWUFBWSxLQUFLLENBQUM7QUFBQSxVQUN0QjtBQUFBLFlBQ0M7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
