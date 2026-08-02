import { OperatingSystem } from "../../../base/common/platform.js";
import { matchesTerminalSandboxCommandRule } from "./terminalSandboxCommandRules.js";
var TerminalSandboxReadAllowListOperation = /* @__PURE__ */ ((TerminalSandboxReadAllowListOperation2) => {
  TerminalSandboxReadAllowListOperation2["Git"] = "git";
  TerminalSandboxReadAllowListOperation2["Node"] = "node";
  TerminalSandboxReadAllowListOperation2["Rust"] = "rust";
  TerminalSandboxReadAllowListOperation2["Go"] = "go";
  TerminalSandboxReadAllowListOperation2["Python"] = "python";
  TerminalSandboxReadAllowListOperation2["Java"] = "java";
  TerminalSandboxReadAllowListOperation2["Dotnet"] = "dotnet";
  TerminalSandboxReadAllowListOperation2["Nuget"] = "nuget";
  TerminalSandboxReadAllowListOperation2["Msbuild"] = "msbuild";
  TerminalSandboxReadAllowListOperation2["Ruby"] = "ruby";
  TerminalSandboxReadAllowListOperation2["NativeBuild"] = "nativeBuild";
  TerminalSandboxReadAllowListOperation2["Conan"] = "conan";
  TerminalSandboxReadAllowListOperation2["GnuPG"] = "gnupg";
  TerminalSandboxReadAllowListOperation2["Ssh"] = "ssh";
  return TerminalSandboxReadAllowListOperation2;
})(TerminalSandboxReadAllowListOperation || {});
const terminalSandboxReadAllowListKeywordMap = /* @__PURE__ */ new Map([
  ["git", "git" /* Git */],
  ["gh", "git" /* Git */],
  ["gpg", "gnupg" /* GnuPG */],
  ["node", "node" /* Node */],
  ["npm", "node" /* Node */],
  ["npx", "node" /* Node */],
  ["pnpm", "node" /* Node */],
  ["yarn", "node" /* Node */],
  ["corepack", "node" /* Node */],
  ["bun", "node" /* Node */],
  ["deno", "node" /* Node */],
  ["nvm", "node" /* Node */],
  ["volta", "node" /* Node */],
  ["fnm", "node" /* Node */],
  ["asdf", "node" /* Node */],
  ["mise", "node" /* Node */],
  ["cargo", "rust" /* Rust */],
  ["rustc", "rust" /* Rust */],
  ["rustup", "rust" /* Rust */],
  ["go", "go" /* Go */],
  ["gofmt", "go" /* Go */],
  ["python", "python" /* Python */],
  ["python3", "python" /* Python */],
  ["pip", "python" /* Python */],
  ["pip3", "python" /* Python */],
  ["poetry", "python" /* Python */],
  ["uv", "python" /* Python */],
  ["pipx", "python" /* Python */],
  ["pyenv", "python" /* Python */],
  ["java", "java" /* Java */],
  ["javac", "java" /* Java */],
  ["jar", "java" /* Java */],
  ["mvn", "java" /* Java */],
  ["mvnw", "java" /* Java */],
  ["gradle", "java" /* Java */],
  ["gradlew", "java" /* Java */],
  ["sdk", "java" /* Java */],
  ["dotnet", "dotnet" /* Dotnet */],
  ["nuget", "nuget" /* Nuget */],
  ["msbuild", "msbuild" /* Msbuild */],
  ["ruby", "ruby" /* Ruby */],
  ["gem", "ruby" /* Ruby */],
  ["bundle", "ruby" /* Ruby */],
  ["bundler", "ruby" /* Ruby */],
  ["rake", "ruby" /* Ruby */],
  ["rbenv", "ruby" /* Ruby */],
  ["rvm", "ruby" /* Ruby */],
  ["ccache", "nativeBuild" /* NativeBuild */],
  ["sccache", "nativeBuild" /* NativeBuild */],
  ["cmake", "nativeBuild" /* NativeBuild */],
  ["conan", "conan" /* Conan */]
]);
function getTerminalSandboxReadAllowListForOperation(operation, os) {
  if (os === OperatingSystem.Windows) {
    return [];
  }
  switch (operation) {
    case "git" /* Git */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.gitconfig",
            "~/.config/gh/config.yml",
            "~/.config/git/config",
            "~/.gitignore",
            "~/.gitignore_global",
            "~/.config/git/ignore",
            "~/.config/git/attributes"
          ];
      }
    case "node" /* Node */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/.npm",
            "~/Library/Caches/node",
            "~/Library/Caches/electron",
            "~/Library/Caches/ms-playwright",
            "~/Library/Caches/Yarn",
            "~/Library/Caches/deno",
            "~/Library/pnpm",
            "~/.electron-gyp",
            "~/.node-gyp",
            "~/.yarn/berry",
            "~/.local/share/pnpm",
            "~/.pnpm-store",
            "~/.bun/install/cache",
            "~/.bun/bin",
            "~/.deno",
            "~/.nvm/versions",
            "~/.nvm/alias",
            "~/.volta/bin",
            "~/.volta/tools",
            "~/.fnm",
            "~/.asdf/installs/nodejs",
            "~/.asdf/shims",
            "~/.local/share/mise/installs/node",
            "~/.local/share/mise/shims"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.npm",
            "~/.cache/node",
            "~/.cache/node/corepack",
            "~/.cache/electron",
            "~/.cache/ms-playwright",
            "~/.cache/yarn",
            "~/.electron-gyp",
            "~/.node-gyp",
            "~/.yarn/berry",
            "~/.local/share/pnpm",
            "~/.pnpm-store",
            "~/.bun/install/cache",
            "~/.bun/bin",
            "~/.deno",
            "~/.cache/deno",
            "~/.nvm/versions",
            "~/.nvm/alias",
            "~/.volta/bin",
            "~/.volta/tools",
            "~/.fnm",
            "~/.asdf/installs/nodejs",
            "~/.asdf/shims",
            "~/.local/share/mise/installs/node",
            "~/.local/share/mise/shims"
          ];
      }
    case "rust" /* Rust */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.cargo/bin",
            "~/.cargo/registry",
            "~/.cargo/git",
            "~/.rustup/toolchains"
          ];
      }
    case "go" /* Go */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/go/pkg/mod",
            "~/go/bin",
            "~/Library/Caches/go-build"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/go/pkg/mod",
            "~/go/bin",
            "~/.cache/go-build"
          ];
      }
    case "python" /* Python */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/Library/Caches/pip",
            "~/Library/Caches/pypoetry",
            "~/Library/Caches/uv",
            "~/.local/bin",
            "~/.local/share/virtualenv",
            "~/.local/share/pipx",
            "~/.pyenv/versions",
            "~/.pyenv/shims"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.cache/pip",
            "~/.cache/pypoetry",
            "~/.cache/uv",
            "~/.local/bin",
            "~/.local/share/virtualenv",
            "~/.local/share/pipx",
            "~/.pyenv/versions",
            "~/.pyenv/shims"
          ];
      }
    case "java" /* Java */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.m2/repository",
            "~/.gradle/caches",
            "~/.gradle/wrapper/dists",
            "~/.sdkman/candidates"
          ];
      }
    case "dotnet" /* Dotnet */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.dotnet"
          ];
      }
    case "nuget" /* Nuget */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/.nuget/packages",
            "~/Library/Caches/NuGet/v3-cache"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.nuget/packages",
            "~/.local/share/NuGet/v3-cache"
          ];
      }
    case "msbuild" /* Msbuild */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [];
      }
    case "ruby" /* Ruby */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/.gem",
            "~/.rbenv/versions",
            "~/.rbenv/shims",
            "~/.rvm/rubies"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.gem",
            "~/.rbenv/versions",
            "~/.rbenv/shims",
            "~/.rvm/rubies"
          ];
      }
    case "nativeBuild" /* NativeBuild */:
      switch (os) {
        case OperatingSystem.Macintosh:
          return [
            "~/Library/Caches/ccache",
            "~/Library/Caches/sccache"
          ];
        case OperatingSystem.Linux:
        default:
          return [
            "~/.cache/ccache",
            "~/.cache/sccache"
          ];
      }
    case "conan" /* Conan */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.conan2/p",
            "~/.conan2/b"
          ];
      }
    case "gnupg" /* GnuPG */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.gnupg"
          ];
      }
    case "ssh" /* Ssh */:
      switch (os) {
        case OperatingSystem.Macintosh:
        case OperatingSystem.Linux:
        default:
          return [
            "~/.ssh"
          ];
      }
  }
}
function getTerminalSandboxReadAllowListForCommandDetails(os, commandDetails) {
  const operations = /* @__PURE__ */ new Set();
  for (const command of commandDetails) {
    for (const rule of terminalSandboxReadAllowListCommandDetailRules) {
      if (matchesTerminalSandboxCommandRule(command, rule, { os })) {
        operations.add(rule.value);
      }
    }
  }
  const paths = [...operations].flatMap((operation) => getTerminalSandboxReadAllowListForOperation(operation, os));
  return [...new Set(paths)];
}
const terminalSandboxReadAllowListCommandDetailRules = [
  {
    keywords: ["gpg", "gpg2"],
    value: "gnupg" /* GnuPG */
  },
  {
    keywords: ["git"],
    value: "gnupg" /* GnuPG */
  },
  {
    keywords: ["git", "ssh", "scp", "sftp", "rsync"],
    value: "ssh" /* Ssh */
  }
];
function getTerminalSandboxReadAllowListForCommands(os, commandKeywords, commandDetails = []) {
  if (commandKeywords.length === 0) {
    return getTerminalSandboxReadAllowListForCommandDetails(os, commandDetails);
  }
  const operations = /* @__PURE__ */ new Set();
  for (const keyword of commandKeywords) {
    const operation = terminalSandboxReadAllowListKeywordMap.get(keyword.toLowerCase());
    if (operation) {
      operations.add(operation);
    }
  }
  const paths = [...operations].flatMap((operation) => getTerminalSandboxReadAllowListForOperation(operation, os));
  return [.../* @__PURE__ */ new Set([...paths, ...getTerminalSandboxReadAllowListForCommandDetails(os, commandDetails)])];
}
export {
  TerminalSandboxReadAllowListOperation,
  getTerminalSandboxReadAllowListForCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3Rlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbFNhbmRib3hDb21tYW5kIH0gZnJvbSAnLi90ZXJtaW5hbFNhbmRib3hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHR5cGUgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRSdWxlLCBtYXRjaGVzVGVybWluYWxTYW5kYm94Q29tbWFuZFJ1bGUgfSBmcm9tICcuL3Rlcm1pbmFsU2FuZGJveENvbW1hbmRSdWxlcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24ge1xuXHRHaXQgPSAnZ2l0Jyxcblx0Tm9kZSA9ICdub2RlJyxcblx0UnVzdCA9ICdydXN0Jyxcblx0R28gPSAnZ28nLFxuXHRQeXRob24gPSAncHl0aG9uJyxcblx0SmF2YSA9ICdqYXZhJyxcblx0RG90bmV0ID0gJ2RvdG5ldCcsXG5cdE51Z2V0ID0gJ251Z2V0Jyxcblx0TXNidWlsZCA9ICdtc2J1aWxkJyxcblx0UnVieSA9ICdydWJ5Jyxcblx0TmF0aXZlQnVpbGQgPSAnbmF0aXZlQnVpbGQnLFxuXHRDb25hbiA9ICdjb25hbicsXG5cdEdudVBHID0gJ2dudXBnJyxcblx0U3NoID0gJ3NzaCcsXG59XG5cbmNvbnN0IHRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RLZXl3b3JkTWFwOiBSZWFkb25seU1hcDxzdHJpbmcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24+ID0gbmV3IE1hcChbXG5cdFsnZ2l0JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5HaXRdLFxuXHRbJ2doJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5HaXRdLFxuXHRbJ2dwZycsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uR251UEddLFxuXHRbJ25vZGUnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5vZGVdLFxuXHRbJ25wbScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZV0sXG5cdFsnbnB4JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0WydwbnBtJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0Wyd5YXJuJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0Wydjb3JlcGFjaycsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZV0sXG5cdFsnYnVuJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0WydkZW5vJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0Wydudm0nLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5vZGVdLFxuXHRbJ3ZvbHRhJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Ob2RlXSxcblx0Wydmbm0nLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5vZGVdLFxuXHRbJ2FzZGYnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5vZGVdLFxuXHRbJ21pc2UnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5vZGVdLFxuXHRbJ2NhcmdvJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdXN0XSxcblx0WydydXN0YycsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUnVzdF0sXG5cdFsncnVzdHVwJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdXN0XSxcblx0WydnbycsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uR29dLFxuXHRbJ2dvZm10JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Hb10sXG5cdFsncHl0aG9uJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob25dLFxuXHRbJ3B5dGhvbjMnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlB5dGhvbl0sXG5cdFsncGlwJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob25dLFxuXHRbJ3BpcDMnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlB5dGhvbl0sXG5cdFsncG9ldHJ5JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob25dLFxuXHRbJ3V2JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob25dLFxuXHRbJ3BpcHgnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlB5dGhvbl0sXG5cdFsncHllbnYnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlB5dGhvbl0sXG5cdFsnamF2YScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uSmF2YV0sXG5cdFsnamF2YWMnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkphdmFdLFxuXHRbJ2phcicsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uSmF2YV0sXG5cdFsnbXZuJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5KYXZhXSxcblx0Wydtdm53JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5KYXZhXSxcblx0WydncmFkbGUnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkphdmFdLFxuXHRbJ2dyYWRsZXcnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkphdmFdLFxuXHRbJ3NkaycsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uSmF2YV0sXG5cdFsnZG90bmV0JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Eb3RuZXRdLFxuXHRbJ251Z2V0JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5OdWdldF0sXG5cdFsnbXNidWlsZCcsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTXNidWlsZF0sXG5cdFsncnVieScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uUnVieV0sXG5cdFsnZ2VtJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdWJ5XSxcblx0WydidW5kbGUnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlJ1YnldLFxuXHRbJ2J1bmRsZXInLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlJ1YnldLFxuXHRbJ3Jha2UnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlJ1YnldLFxuXHRbJ3JiZW52JywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdWJ5XSxcblx0Wydydm0nLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLlJ1YnldLFxuXHRbJ2NjYWNoZScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTmF0aXZlQnVpbGRdLFxuXHRbJ3NjY2FjaGUnLCBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLk5hdGl2ZUJ1aWxkXSxcblx0WydjbWFrZScsIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTmF0aXZlQnVpbGRdLFxuXHRbJ2NvbmFuJywgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Db25hbl0sXG5dKTtcblxuLyoqXG4gKiBQYXRocyB0aGF0IGNvbW1vbiBkZXZlbG9wZXIgdG9vbHMgdHlwaWNhbGx5IG5lZWQgdG8gcmVhZCB3aGVuIHRoZSB1c2VyJ3MgaG9tZVxuICogZGlyZWN0b3J5IGlzIGJyb2FkbHkgZGVuaWVkLiBCcm9hZCBrZXl3b3JkLWJhc2VkIHJ1bGVzIGludGVudGlvbmFsbHkgYXZvaWQgb2J2aW91c1xuICogY3JlZGVudGlhbCBhbmQga2V5IG1hdGVyaWFsIHN1Y2ggYXMgfi8uc3NoLCB+Ly5nbnVwZywgY2xvdWQgY3JlZGVudGlhbHMsXG4gKiBwYWNrYWdlIG1hbmFnZXIgYXV0aCBmaWxlcywgYW5kIGdpdCBjcmVkZW50aWFsIHN0b3Jlcy4gU2Vuc2l0aXZlIG9wZXJhdGlvbnNcbiAqIHNob3VsZCBvbmx5IGJlIHJlZmVyZW5jZWQgYnkgY29tbWFuZC1kZXRhaWwgcnVsZXMgc2NvcGVkIHRvIGNvbW1hbmRzIG9yXG4gKiBzdWJjb21tYW5kcyB0aGF0IHJlcXVpcmUgdGhlbS5cbiAqL1xuXG5mdW5jdGlvbiBnZXRUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0Rm9yT3BlcmF0aW9uKG9wZXJhdGlvbjogVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbiwgb3M6IE9wZXJhdGluZ1N5c3RlbSk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHN3aXRjaCAob3BlcmF0aW9uKSB7XG5cdFx0Y2FzZSBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkdpdDpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vLmdpdGNvbmZpZycsXG5cdFx0XHRcdFx0XHQnfi8uY29uZmlnL2doL2NvbmZpZy55bWwnLFxuXHRcdFx0XHRcdFx0J34vLmNvbmZpZy9naXQvY29uZmlnJyxcblx0XHRcdFx0XHRcdCd+Ly5naXRpZ25vcmUnLFxuXHRcdFx0XHRcdFx0J34vLmdpdGlnbm9yZV9nbG9iYWwnLFxuXHRcdFx0XHRcdFx0J34vLmNvbmZpZy9naXQvaWdub3JlJyxcblx0XHRcdFx0XHRcdCd+Ly5jb25maWcvZ2l0L2F0dHJpYnV0ZXMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTm9kZTpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8ubnBtJyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL25vZGUnLFxuXHRcdFx0XHRcdFx0J34vTGlicmFyeS9DYWNoZXMvZWxlY3Ryb24nLFxuXHRcdFx0XHRcdFx0J34vTGlicmFyeS9DYWNoZXMvbXMtcGxheXdyaWdodCcsXG5cdFx0XHRcdFx0XHQnfi9MaWJyYXJ5L0NhY2hlcy9ZYXJuJyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL2Rlbm8nLFxuXHRcdFx0XHRcdFx0J34vTGlicmFyeS9wbnBtJyxcblx0XHRcdFx0XHRcdCd+Ly5lbGVjdHJvbi1neXAnLFxuXHRcdFx0XHRcdFx0J34vLm5vZGUtZ3lwJyxcblx0XHRcdFx0XHRcdCd+Ly55YXJuL2JlcnJ5Jyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS9wbnBtJyxcblx0XHRcdFx0XHRcdCd+Ly5wbnBtLXN0b3JlJyxcblx0XHRcdFx0XHRcdCd+Ly5idW4vaW5zdGFsbC9jYWNoZScsXG5cdFx0XHRcdFx0XHQnfi8uYnVuL2JpbicsXG5cdFx0XHRcdFx0XHQnfi8uZGVubycsXG5cdFx0XHRcdFx0XHQnfi8ubnZtL3ZlcnNpb25zJyxcblx0XHRcdFx0XHRcdCd+Ly5udm0vYWxpYXMnLFxuXHRcdFx0XHRcdFx0J34vLnZvbHRhL2JpbicsXG5cdFx0XHRcdFx0XHQnfi8udm9sdGEvdG9vbHMnLFxuXHRcdFx0XHRcdFx0J34vLmZubScsXG5cdFx0XHRcdFx0XHQnfi8uYXNkZi9pbnN0YWxscy9ub2RlanMnLFxuXHRcdFx0XHRcdFx0J34vLmFzZGYvc2hpbXMnLFxuXHRcdFx0XHRcdFx0J34vLmxvY2FsL3NoYXJlL21pc2UvaW5zdGFsbHMvbm9kZScsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvc2hhcmUvbWlzZS9zaGltcycsXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5ucG0nLFxuXHRcdFx0XHRcdFx0J34vLmNhY2hlL25vZGUnLFxuXHRcdFx0XHRcdFx0J34vLmNhY2hlL25vZGUvY29yZXBhY2snLFxuXHRcdFx0XHRcdFx0J34vLmNhY2hlL2VsZWN0cm9uJyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9tcy1wbGF5d3JpZ2h0Jyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS95YXJuJyxcblx0XHRcdFx0XHRcdCd+Ly5lbGVjdHJvbi1neXAnLFxuXHRcdFx0XHRcdFx0J34vLm5vZGUtZ3lwJyxcblx0XHRcdFx0XHRcdCd+Ly55YXJuL2JlcnJ5Jyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS9wbnBtJyxcblx0XHRcdFx0XHRcdCd+Ly5wbnBtLXN0b3JlJyxcblx0XHRcdFx0XHRcdCd+Ly5idW4vaW5zdGFsbC9jYWNoZScsXG5cdFx0XHRcdFx0XHQnfi8uYnVuL2JpbicsXG5cdFx0XHRcdFx0XHQnfi8uZGVubycsXG5cdFx0XHRcdFx0XHQnfi8uY2FjaGUvZGVubycsXG5cdFx0XHRcdFx0XHQnfi8ubnZtL3ZlcnNpb25zJyxcblx0XHRcdFx0XHRcdCd+Ly5udm0vYWxpYXMnLFxuXHRcdFx0XHRcdFx0J34vLnZvbHRhL2JpbicsXG5cdFx0XHRcdFx0XHQnfi8udm9sdGEvdG9vbHMnLFxuXHRcdFx0XHRcdFx0J34vLmZubScsXG5cdFx0XHRcdFx0XHQnfi8uYXNkZi9pbnN0YWxscy9ub2RlanMnLFxuXHRcdFx0XHRcdFx0J34vLmFzZGYvc2hpbXMnLFxuXHRcdFx0XHRcdFx0J34vLmxvY2FsL3NoYXJlL21pc2UvaW5zdGFsbHMvbm9kZScsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvc2hhcmUvbWlzZS9zaGltcycsXG5cdFx0XHRcdFx0XTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdXN0OlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi8uY2FyZ28vYmluJyxcblx0XHRcdFx0XHRcdCd+Ly5jYXJnby9yZWdpc3RyeScsXG5cdFx0XHRcdFx0XHQnfi8uY2FyZ28vZ2l0Jyxcblx0XHRcdFx0XHRcdCd+Ly5ydXN0dXAvdG9vbGNoYWlucycsXG5cdFx0XHRcdFx0XTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Hbzpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi9nby9wa2cvbW9kJyxcblx0XHRcdFx0XHRcdCd+L2dvL2JpbicsXG5cdFx0XHRcdFx0XHQnfi9MaWJyYXJ5L0NhY2hlcy9nby1idWlsZCcsXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+L2dvL3BrZy9tb2QnLFxuXHRcdFx0XHRcdFx0J34vZ28vYmluJyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9nby1idWlsZCcsXG5cdFx0XHRcdFx0XTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5QeXRob246XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vTGlicmFyeS9DYWNoZXMvcGlwJyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL3B5cG9ldHJ5Jyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL3V2Jyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9iaW4nLFxuXHRcdFx0XHRcdFx0J34vLmxvY2FsL3NoYXJlL3ZpcnR1YWxlbnYnLFxuXHRcdFx0XHRcdFx0J34vLmxvY2FsL3NoYXJlL3BpcHgnLFxuXHRcdFx0XHRcdFx0J34vLnB5ZW52L3ZlcnNpb25zJyxcblx0XHRcdFx0XHRcdCd+Ly5weWVudi9zaGltcycsXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9waXAnLFxuXHRcdFx0XHRcdFx0J34vLmNhY2hlL3B5cG9ldHJ5Jyxcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS91dicsXG5cdFx0XHRcdFx0XHQnfi8ubG9jYWwvYmluJyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS92aXJ0dWFsZW52Jyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS9waXB4Jyxcblx0XHRcdFx0XHRcdCd+Ly5weWVudi92ZXJzaW9ucycsXG5cdFx0XHRcdFx0XHQnfi8ucHllbnYvc2hpbXMnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uSmF2YTpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vLm0yL3JlcG9zaXRvcnknLFxuXHRcdFx0XHRcdFx0J34vLmdyYWRsZS9jYWNoZXMnLFxuXHRcdFx0XHRcdFx0J34vLmdyYWRsZS93cmFwcGVyL2Rpc3RzJyxcblx0XHRcdFx0XHRcdCd+Ly5zZGttYW4vY2FuZGlkYXRlcycsXG5cdFx0XHRcdFx0XTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Eb3RuZXQ6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5kb3RuZXQnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uTnVnZXQ6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vLm51Z2V0L3BhY2thZ2VzJyxcblx0XHRcdFx0XHRcdCd+L0xpYnJhcnkvQ2FjaGVzL051R2V0L3YzLWNhY2hlJyxcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdFx0J34vLm51Z2V0L3BhY2thZ2VzJyxcblx0XHRcdFx0XHRcdCd+Ly5sb2NhbC9zaGFyZS9OdUdldC92My1jYWNoZScsXG5cdFx0XHRcdFx0XTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Nc2J1aWxkOlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLkxpbnV4OlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5SdWJ5OlxuXHRcdFx0c3dpdGNoIChvcykge1xuXHRcdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5nZW0nLFxuXHRcdFx0XHRcdFx0J34vLnJiZW52L3ZlcnNpb25zJyxcblx0XHRcdFx0XHRcdCd+Ly5yYmVudi9zaGltcycsXG5cdFx0XHRcdFx0XHQnfi8ucnZtL3J1YmllcycsXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5nZW0nLFxuXHRcdFx0XHRcdFx0J34vLnJiZW52L3ZlcnNpb25zJyxcblx0XHRcdFx0XHRcdCd+Ly5yYmVudi9zaGltcycsXG5cdFx0XHRcdFx0XHQnfi8ucnZtL3J1YmllcycsXG5cdFx0XHRcdFx0XTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5OYXRpdmVCdWlsZDpcblx0XHRcdHN3aXRjaCAob3MpIHtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoOlxuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHQnfi9MaWJyYXJ5L0NhY2hlcy9jY2FjaGUnLFxuXHRcdFx0XHRcdFx0J34vTGlicmFyeS9DYWNoZXMvc2NjYWNoZScsXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5jYWNoZS9jY2FjaGUnLFxuXHRcdFx0XHRcdFx0J34vLmNhY2hlL3NjY2FjaGUnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uQ29uYW46XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5jb25hbjIvcCcsXG5cdFx0XHRcdFx0XHQnfi8uY29uYW4yL2InLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cblx0XHRjYXNlIFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uR251UEc6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5nbnVwZycsXG5cdFx0XHRcdFx0XTtcblx0XHRcdH1cblxuXHRcdGNhc2UgVGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdE9wZXJhdGlvbi5Tc2g6XG5cdFx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdFx0Y2FzZSBPcGVyYXRpbmdTeXN0ZW0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCd+Ly5zc2gnLFxuXHRcdFx0XHRcdF07XG5cdFx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0VGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdEZvckNvbW1hbmREZXRhaWxzKG9zOiBPcGVyYXRpbmdTeXN0ZW0sIGNvbW1hbmREZXRhaWxzOiByZWFkb25seSBJVGVybWluYWxTYW5kYm94Q29tbWFuZFtdKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRjb25zdCBvcGVyYXRpb25zID0gbmV3IFNldDxUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uPigpO1xuXHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29tbWFuZERldGFpbHMpIHtcblx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgdGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdENvbW1hbmREZXRhaWxSdWxlcykge1xuXHRcdFx0aWYgKG1hdGNoZXNUZXJtaW5hbFNhbmRib3hDb21tYW5kUnVsZShjb21tYW5kLCBydWxlLCB7IG9zIH0pKSB7XG5cdFx0XHRcdG9wZXJhdGlvbnMuYWRkKHJ1bGUudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHBhdGhzID0gWy4uLm9wZXJhdGlvbnNdLmZsYXRNYXAob3BlcmF0aW9uID0+IGdldFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RGb3JPcGVyYXRpb24ob3BlcmF0aW9uLCBvcykpO1xuXHRyZXR1cm4gWy4uLm5ldyBTZXQocGF0aHMpXTtcbn1cblxuLyoqXG4gKiBDb21tYW5kLWRldGFpbCBhbGxvdy1saXN0IHJ1bGVzIG1hdGNoIHBhcnNlZCBjb21tYW5kIGV4ZWN1dGFibGVzLlxuICpcbiAqIEZvciBleGFtcGxlLCBgZ2l0IHJlYmFzZSBtYWluYCBtYXRjaGVzIHRoZSBgZ2l0YCBydWxlIGJlbG93LCB3aGlsZVxuICogYGdwZyAtLWxpc3Qta2V5c2AgbWF0Y2hlcyB0aGUgYGdwZ2AgcnVsZS5cbiAqL1xuY29uc3QgdGVybWluYWxTYW5kYm94UmVhZEFsbG93TGlzdENvbW1hbmREZXRhaWxSdWxlczogcmVhZG9ubHkgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRSdWxlPFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24+W10gPSBbXG5cdHtcblx0XHRrZXl3b3JkczogWydncGcnLCAnZ3BnMiddLFxuXHRcdHZhbHVlOiBUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0T3BlcmF0aW9uLkdudVBHLFxuXHR9LFxuXHR7XG5cdFx0a2V5d29yZHM6IFsnZ2l0J10sXG5cdFx0dmFsdWU6IFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uR251UEcsXG5cdH0sXG5cdHtcblx0XHRrZXl3b3JkczogWydnaXQnLCAnc3NoJywgJ3NjcCcsICdzZnRwJywgJ3JzeW5jJ10sXG5cdFx0dmFsdWU6IFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24uU3NoLFxuXHR9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RGb3JDb21tYW5kcyhvczogT3BlcmF0aW5nU3lzdGVtLCBjb21tYW5kS2V5d29yZHM6IHJlYWRvbmx5IHN0cmluZ1tdLCBjb21tYW5kRGV0YWlsczogcmVhZG9ubHkgSVRlcm1pbmFsU2FuZGJveENvbW1hbmRbXSA9IFtdKTogcmVhZG9ubHkgc3RyaW5nW10ge1xuXHRpZiAoY29tbWFuZEtleXdvcmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBnZXRUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0Rm9yQ29tbWFuZERldGFpbHMob3MsIGNvbW1hbmREZXRhaWxzKTtcblx0fVxuXG5cdGNvbnN0IG9wZXJhdGlvbnMgPSBuZXcgU2V0PFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RPcGVyYXRpb24+KCk7XG5cdGZvciAoY29uc3Qga2V5d29yZCBvZiBjb21tYW5kS2V5d29yZHMpIHtcblx0XHRjb25zdCBvcGVyYXRpb24gPSB0ZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0S2V5d29yZE1hcC5nZXQoa2V5d29yZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRpZiAob3BlcmF0aW9uKSB7XG5cdFx0XHRvcGVyYXRpb25zLmFkZChvcGVyYXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHBhdGhzID0gWy4uLm9wZXJhdGlvbnNdLmZsYXRNYXAob3BlcmF0aW9uID0+IGdldFRlcm1pbmFsU2FuZGJveFJlYWRBbGxvd0xpc3RGb3JPcGVyYXRpb24ob3BlcmF0aW9uLCBvcykpO1xuXHRyZXR1cm4gWy4uLm5ldyBTZXQoWy4uLnBhdGhzLCAuLi5nZXRUZXJtaW5hbFNhbmRib3hSZWFkQWxsb3dMaXN0Rm9yQ29tbWFuZERldGFpbHMob3MsIGNvbW1hbmREZXRhaWxzKV0pXTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBRWhDLFNBQTJDLHlDQUF5QztBQUU3RSxJQUFXLHdDQUFYLGtCQUFXQSwyQ0FBWDtBQUNOLEVBQUFBLHVDQUFBLFNBQU07QUFDTixFQUFBQSx1Q0FBQSxVQUFPO0FBQ1AsRUFBQUEsdUNBQUEsVUFBTztBQUNQLEVBQUFBLHVDQUFBLFFBQUs7QUFDTCxFQUFBQSx1Q0FBQSxZQUFTO0FBQ1QsRUFBQUEsdUNBQUEsVUFBTztBQUNQLEVBQUFBLHVDQUFBLFlBQVM7QUFDVCxFQUFBQSx1Q0FBQSxXQUFRO0FBQ1IsRUFBQUEsdUNBQUEsYUFBVTtBQUNWLEVBQUFBLHVDQUFBLFVBQU87QUFDUCxFQUFBQSx1Q0FBQSxpQkFBYztBQUNkLEVBQUFBLHVDQUFBLFdBQVE7QUFDUixFQUFBQSx1Q0FBQSxXQUFRO0FBQ1IsRUFBQUEsdUNBQUEsU0FBTTtBQWRXLFNBQUFBO0FBQUEsR0FBQTtBQWlCbEIsTUFBTSx5Q0FBcUcsb0JBQUksSUFBSTtBQUFBLEVBQ2xILENBQUMsT0FBTyxlQUF5QztBQUFBLEVBQ2pELENBQUMsTUFBTSxlQUF5QztBQUFBLEVBQ2hELENBQUMsT0FBTyxtQkFBMkM7QUFBQSxFQUNuRCxDQUFDLFFBQVEsaUJBQTBDO0FBQUEsRUFDbkQsQ0FBQyxPQUFPLGlCQUEwQztBQUFBLEVBQ2xE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
