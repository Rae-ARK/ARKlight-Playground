import { deepStrictEqual, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DEFAULT_TERMINAL_OSX } from "../../common/externalTerminal.js";
import { LinuxExternalTerminalService, MacExternalTerminalService, WindowsExternalTerminalService } from "../../node/externalTerminalService.js";
const mockConfig = Object.freeze({
  terminal: {
    explorerKind: "external",
    external: {
      windowsExec: "testWindowsShell",
      osxExec: "testOSXShell",
      linuxExec: "testLinuxShell"
    }
  }
});
suite("ExternalTerminalService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test(`WinTerminalService - uses terminal from configuration`, (done) => {
    const testShell = "cmd";
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(command, testShell, "shell should equal expected");
        strictEqual(args[args.length - 1], mockConfig.terminal.external.windowsExec);
        strictEqual(opts.cwd, testCwd);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testShell,
      testCwd
    );
  });
  test(`WinTerminalService - uses default terminal when configuration.terminal.external.windowsExec is undefined`, (done) => {
    const testShell = "cmd";
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(args[args.length - 1], WindowsExternalTerminalService.getDefaultTerminalWindows());
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    mockConfig.terminal.external.windowsExec = void 0;
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testShell,
      testCwd
    );
  });
  test(`WinTerminalService - cwd is correct regardless of case`, (done) => {
    const testShell = "cmd";
    const testCwd = "c:/foo";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(opts.cwd, "C:/foo", "cwd should be uppercase regardless of the case that's passed in");
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testShell,
      testCwd
    );
  });
  test(`WinTerminalService - cmder should be spawned differently`, (done) => {
    const testShell = "cmd";
    const testCwd = "c:/foo";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        deepStrictEqual(args, ["C:/foo"]);
        strictEqual(opts, void 0);
        done();
        return { on: (evt) => evt };
      }
    };
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      { windowsExec: "cmder" },
      testShell,
      testCwd
    );
  });
  test(`WinTerminalService - windows terminal should open workspace directory`, (done) => {
    const testShell = "wt";
    const testCwd = "c:/foo";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(opts.cwd, "C:/foo");
        done();
        return { on: (evt) => evt };
      }
    };
    const testService = new WindowsExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testShell,
      testCwd
    );
  });
  test(`MacTerminalService - uses terminal from configuration`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(args[1], mockConfig.terminal.external.osxExec);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new MacExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testCwd
    );
  });
  test(`MacTerminalService - uses default terminal when configuration.terminal.external.osxExec is undefined`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(args[1], DEFAULT_TERMINAL_OSX);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new MacExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      { osxExec: void 0 },
      testCwd
    );
  });
  test(`MacTerminalService - Ghostty.app should be spawned correctly`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(command, "/usr/bin/open");
        strictEqual(args[0], "-a");
        strictEqual(args[1], "Ghostty.app");
        strictEqual(args[2], testCwd);
        strictEqual(opts.cwd, testCwd);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new MacExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      { osxExec: "Ghostty.app" },
      testCwd
    );
  });
  test(`LinuxTerminalService - uses terminal from configuration`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(command, mockConfig.terminal.external.linuxExec);
        strictEqual(opts.cwd, testCwd);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new LinuxExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      mockConfig.terminal.external,
      testCwd
    );
  });
  test(`LinuxTerminalService - Ghostty should be spawned with working directory`, (done) => {
    const testCwd = "path/to/workspace";
    const mockSpawner = {
      spawn: (command, args, opts) => {
        strictEqual(command, "ghostty");
        deepStrictEqual(args, [`--working-directory=${testCwd}`]);
        strictEqual(opts.cwd, testCwd);
        done();
        return {
          on: (evt) => evt
        };
      }
    };
    const testService = new LinuxExternalTerminalService();
    testService.spawnTerminal(
      mockSpawner,
      { linuxExec: "ghostty" },
      testCwd
    );
  });
  test(`LinuxTerminalService - uses default terminal when configuration.terminal.external.linuxExec is undefined`, (done) => {
    LinuxExternalTerminalService.getDefaultTerminalLinuxReady().then((defaultTerminalLinux) => {
      const testCwd = "path/to/workspace";
      const mockSpawner = {
        spawn: (command, args, opts) => {
          strictEqual(command, defaultTerminalLinux);
          done();
          return {
            on: (evt) => evt
          };
        }
      };
      mockConfig.terminal.external.linuxExec = void 0;
      const testService = new LinuxExternalTerminalService();
      testService.spawnTerminal(
        mockSpawner,
        mockConfig.terminal.external,
        testCwd
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVybmFsVGVybWluYWwvdGVzdC9ub2RlL2V4dGVybmFsVGVybWluYWxTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9URVJNSU5BTF9PU1gsIElFeHRlcm5hbFRlcm1pbmFsQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRlcm5hbFRlcm1pbmFsLmpzJztcbmltcG9ydCB7IExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UsIE1hY0V4dGVybmFsVGVybWluYWxTZXJ2aWNlLCBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2V4dGVybmFsVGVybWluYWxTZXJ2aWNlLmpzJztcblxuY29uc3QgbW9ja0NvbmZpZyA9IE9iamVjdC5mcmVlemU8SUV4dGVybmFsVGVybWluYWxDb25maWd1cmF0aW9uPih7XG5cdHRlcm1pbmFsOiB7XG5cdFx0ZXhwbG9yZXJLaW5kOiAnZXh0ZXJuYWwnLFxuXHRcdGV4dGVybmFsOiB7XG5cdFx0XHR3aW5kb3dzRXhlYzogJ3Rlc3RXaW5kb3dzU2hlbGwnLFxuXHRcdFx0b3N4RXhlYzogJ3Rlc3RPU1hTaGVsbCcsXG5cdFx0XHRsaW51eEV4ZWM6ICd0ZXN0TGludXhTaGVsbCdcblx0XHR9XG5cdH1cbn0pO1xuXG5zdWl0ZSgnRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoYFdpblRlcm1pbmFsU2VydmljZSAtIHVzZXMgdGVybWluYWwgZnJvbSBjb25maWd1cmF0aW9uYCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNoZWxsID0gJ2NtZCc7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdwYXRoL3RvL3dvcmtzcGFjZSc7XG5cdFx0Y29uc3QgbW9ja1NwYXduZXI6IGFueSA9IHtcblx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChjb21tYW5kLCB0ZXN0U2hlbGwsICdzaGVsbCBzaG91bGQgZXF1YWwgZXhwZWN0ZWQnKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXJnc1thcmdzLmxlbmd0aCAtIDFdLCBtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLndpbmRvd3NFeGVjKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwob3B0cy5jd2QsIHRlc3RDd2QpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b246IChldnQ6IGFueSkgPT4gZXZ0XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IG5ldyBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UoKTtcblx0XHR0ZXN0U2VydmljZS5zcGF3blRlcm1pbmFsKFxuXHRcdFx0bW9ja1NwYXduZXIsXG5cdFx0XHRtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLFxuXHRcdFx0dGVzdFNoZWxsLFxuXHRcdFx0dGVzdEN3ZFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoYFdpblRlcm1pbmFsU2VydmljZSAtIHVzZXMgZGVmYXVsdCB0ZXJtaW5hbCB3aGVuIGNvbmZpZ3VyYXRpb24udGVybWluYWwuZXh0ZXJuYWwud2luZG93c0V4ZWMgaXMgdW5kZWZpbmVkYCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNoZWxsID0gJ2NtZCc7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdwYXRoL3RvL3dvcmtzcGFjZSc7XG5cdFx0Y29uc3QgbW9ja1NwYXduZXI6IGFueSA9IHtcblx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhcmdzW2FyZ3MubGVuZ3RoIC0gMV0sIFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZS5nZXREZWZhdWx0VGVybWluYWxXaW5kb3dzKCkpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b246IChldnQ6IGFueSkgPT4gZXZ0XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLndpbmRvd3NFeGVjID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZSgpO1xuXHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdG1vY2tDb25maWcudGVybWluYWwuZXh0ZXJuYWwsXG5cdFx0XHR0ZXN0U2hlbGwsXG5cdFx0XHR0ZXN0Q3dkXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdChgV2luVGVybWluYWxTZXJ2aWNlIC0gY3dkIGlzIGNvcnJlY3QgcmVnYXJkbGVzcyBvZiBjYXNlYCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdFNoZWxsID0gJ2NtZCc7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdjOi9mb28nO1xuXHRcdGNvbnN0IG1vY2tTcGF3bmVyOiBhbnkgPSB7XG5cdFx0XHRzcGF3bjogKGNvbW1hbmQ6IGFueSwgYXJnczogYW55LCBvcHRzOiBhbnkpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwob3B0cy5jd2QsICdDOi9mb28nLCAnY3dkIHNob3VsZCBiZSB1cHBlcmNhc2UgcmVnYXJkbGVzcyBvZiB0aGUgY2FzZSB0aGF0XFwncyBwYXNzZWQgaW4nKTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9uOiAoZXZ0OiBhbnkpID0+IGV2dFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBuZXcgV2luZG93c0V4dGVybmFsVGVybWluYWxTZXJ2aWNlKCk7XG5cdFx0dGVzdFNlcnZpY2Uuc3Bhd25UZXJtaW5hbChcblx0XHRcdG1vY2tTcGF3bmVyLFxuXHRcdFx0bW9ja0NvbmZpZy50ZXJtaW5hbC5leHRlcm5hbCxcblx0XHRcdHRlc3RTaGVsbCxcblx0XHRcdHRlc3RDd2Rcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KGBXaW5UZXJtaW5hbFNlcnZpY2UgLSBjbWRlciBzaG91bGQgYmUgc3Bhd25lZCBkaWZmZXJlbnRseWAsIGRvbmUgPT4ge1xuXHRcdGNvbnN0IHRlc3RTaGVsbCA9ICdjbWQnO1xuXHRcdGNvbnN0IHRlc3RDd2QgPSAnYzovZm9vJztcblx0XHRjb25zdCBtb2NrU3Bhd25lcjogYW55ID0ge1xuXHRcdFx0c3Bhd246IChjb21tYW5kOiBhbnksIGFyZ3M6IGFueSwgb3B0czogYW55KSA9PiB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhcmdzLCBbJ0M6L2ZvbyddKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwob3B0cywgdW5kZWZpbmVkKTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRyZXR1cm4geyBvbjogKGV2dDogYW55KSA9PiBldnQgfTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IFdpbmRvd3NFeHRlcm5hbFRlcm1pbmFsU2VydmljZSgpO1xuXHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdHsgd2luZG93c0V4ZWM6ICdjbWRlcicgfSxcblx0XHRcdHRlc3RTaGVsbCxcblx0XHRcdHRlc3RDd2Rcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KGBXaW5UZXJtaW5hbFNlcnZpY2UgLSB3aW5kb3dzIHRlcm1pbmFsIHNob3VsZCBvcGVuIHdvcmtzcGFjZSBkaXJlY3RvcnlgLCBkb25lID0+IHtcblx0XHRjb25zdCB0ZXN0U2hlbGwgPSAnd3QnO1xuXHRcdGNvbnN0IHRlc3RDd2QgPSAnYzovZm9vJztcblx0XHRjb25zdCBtb2NrU3Bhd25lcjogYW55ID0ge1xuXHRcdFx0c3Bhd246IChjb21tYW5kOiBhbnksIGFyZ3M6IGFueSwgb3B0czogYW55KSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKG9wdHMuY3dkLCAnQzovZm9vJyk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuIHsgb246IChldnQ6IGFueSkgPT4gZXZ0IH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IG5ldyBXaW5kb3dzRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UoKTtcblx0XHR0ZXN0U2VydmljZS5zcGF3blRlcm1pbmFsKFxuXHRcdFx0bW9ja1NwYXduZXIsXG5cdFx0XHRtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLFxuXHRcdFx0dGVzdFNoZWxsLFxuXHRcdFx0dGVzdEN3ZFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoYE1hY1Rlcm1pbmFsU2VydmljZSAtIHVzZXMgdGVybWluYWwgZnJvbSBjb25maWd1cmF0aW9uYCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdwYXRoL3RvL3dvcmtzcGFjZSc7XG5cdFx0Y29uc3QgbW9ja1NwYXduZXI6IGFueSA9IHtcblx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhcmdzWzFdLCBtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLm9zeEV4ZWMpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b246IChldnQ6IGFueSkgPT4gZXZ0XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IG5ldyBNYWNFeHRlcm5hbFRlcm1pbmFsU2VydmljZSgpO1xuXHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdG1vY2tDb25maWcudGVybWluYWwuZXh0ZXJuYWwsXG5cdFx0XHR0ZXN0Q3dkXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdChgTWFjVGVybWluYWxTZXJ2aWNlIC0gdXNlcyBkZWZhdWx0IHRlcm1pbmFsIHdoZW4gY29uZmlndXJhdGlvbi50ZXJtaW5hbC5leHRlcm5hbC5vc3hFeGVjIGlzIHVuZGVmaW5lZGAsIGRvbmUgPT4ge1xuXHRcdGNvbnN0IHRlc3RDd2QgPSAncGF0aC90by93b3Jrc3BhY2UnO1xuXHRcdGNvbnN0IG1vY2tTcGF3bmVyOiBhbnkgPSB7XG5cdFx0XHRzcGF3bjogKGNvbW1hbmQ6IGFueSwgYXJnczogYW55LCBvcHRzOiBhbnkpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXJnc1sxXSwgREVGQVVMVF9URVJNSU5BTF9PU1gpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b246IChldnQ6IGFueSkgPT4gZXZ0XG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB0ZXN0U2VydmljZSA9IG5ldyBNYWNFeHRlcm5hbFRlcm1pbmFsU2VydmljZSgpO1xuXHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdHsgb3N4RXhlYzogdW5kZWZpbmVkIH0sXG5cdFx0XHR0ZXN0Q3dkXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdChgTWFjVGVybWluYWxTZXJ2aWNlIC0gR2hvc3R0eS5hcHAgc2hvdWxkIGJlIHNwYXduZWQgY29ycmVjdGx5YCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdwYXRoL3RvL3dvcmtzcGFjZSc7XG5cdFx0Y29uc3QgbW9ja1NwYXduZXI6IGFueSA9IHtcblx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChjb21tYW5kLCAnL3Vzci9iaW4vb3BlbicpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhcmdzWzBdLCAnLWEnKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXJnc1sxXSwgJ0dob3N0dHkuYXBwJyk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGFyZ3NbMl0sIHRlc3RDd2QpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChvcHRzLmN3ZCwgdGVzdEN3ZCk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbjogKGV2dDogYW55KSA9PiBldnRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IE1hY0V4dGVybmFsVGVybWluYWxTZXJ2aWNlKCk7XG5cdFx0dGVzdFNlcnZpY2Uuc3Bhd25UZXJtaW5hbChcblx0XHRcdG1vY2tTcGF3bmVyLFxuXHRcdFx0eyBvc3hFeGVjOiAnR2hvc3R0eS5hcHAnIH0sXG5cdFx0XHR0ZXN0Q3dkXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdChgTGludXhUZXJtaW5hbFNlcnZpY2UgLSB1c2VzIHRlcm1pbmFsIGZyb20gY29uZmlndXJhdGlvbmAsIGRvbmUgPT4ge1xuXHRcdGNvbnN0IHRlc3RDd2QgPSAncGF0aC90by93b3Jrc3BhY2UnO1xuXHRcdGNvbnN0IG1vY2tTcGF3bmVyOiBhbnkgPSB7XG5cdFx0XHRzcGF3bjogKGNvbW1hbmQ6IGFueSwgYXJnczogYW55LCBvcHRzOiBhbnkpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoY29tbWFuZCwgbW9ja0NvbmZpZy50ZXJtaW5hbC5leHRlcm5hbC5saW51eEV4ZWMpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChvcHRzLmN3ZCwgdGVzdEN3ZCk7XG5cdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbjogKGV2dDogYW55KSA9PiBldnRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlc3RTZXJ2aWNlID0gbmV3IExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UoKTtcblx0XHR0ZXN0U2VydmljZS5zcGF3blRlcm1pbmFsKFxuXHRcdFx0bW9ja1NwYXduZXIsXG5cdFx0XHRtb2NrQ29uZmlnLnRlcm1pbmFsLmV4dGVybmFsLFxuXHRcdFx0dGVzdEN3ZFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoYExpbnV4VGVybWluYWxTZXJ2aWNlIC0gR2hvc3R0eSBzaG91bGQgYmUgc3Bhd25lZCB3aXRoIHdvcmtpbmcgZGlyZWN0b3J5YCwgZG9uZSA9PiB7XG5cdFx0Y29uc3QgdGVzdEN3ZCA9ICdwYXRoL3RvL3dvcmtzcGFjZSc7XG5cdFx0Y29uc3QgbW9ja1NwYXduZXI6IGFueSA9IHtcblx0XHRcdHNwYXduOiAoY29tbWFuZDogYW55LCBhcmdzOiBhbnksIG9wdHM6IGFueSkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChjb21tYW5kLCAnZ2hvc3R0eScpO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYXJncywgW2AtLXdvcmtpbmctZGlyZWN0b3J5PSR7dGVzdEN3ZH1gXSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKG9wdHMuY3dkLCB0ZXN0Q3dkKTtcblx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9uOiAoZXZ0OiBhbnkpID0+IGV2dFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdGVzdFNlcnZpY2UgPSBuZXcgTGludXhFeHRlcm5hbFRlcm1pbmFsU2VydmljZSgpO1xuXHRcdHRlc3RTZXJ2aWNlLnNwYXduVGVybWluYWwoXG5cdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdHsgbGludXhFeGVjOiAnZ2hvc3R0eScgfSxcblx0XHRcdHRlc3RDd2Rcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KGBMaW51eFRlcm1pbmFsU2VydmljZSAtIHVzZXMgZGVmYXVsdCB0ZXJtaW5hbCB3aGVuIGNvbmZpZ3VyYXRpb24udGVybWluYWwuZXh0ZXJuYWwubGludXhFeGVjIGlzIHVuZGVmaW5lZGAsIGRvbmUgPT4ge1xuXHRcdExpbnV4RXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UuZ2V0RGVmYXVsdFRlcm1pbmFsTGludXhSZWFkeSgpLnRoZW4oZGVmYXVsdFRlcm1pbmFsTGludXggPT4ge1xuXHRcdFx0Y29uc3QgdGVzdEN3ZCA9ICdwYXRoL3RvL3dvcmtzcGFjZSc7XG5cdFx0XHRjb25zdCBtb2NrU3Bhd25lcjogYW55ID0ge1xuXHRcdFx0XHRzcGF3bjogKGNvbW1hbmQ6IGFueSwgYXJnczogYW55LCBvcHRzOiBhbnkpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChjb21tYW5kLCBkZWZhdWx0VGVybWluYWxMaW51eCk7XG5cdFx0XHRcdFx0ZG9uZSgpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRvbjogKGV2dDogYW55KSA9PiBldnRcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0bW9ja0NvbmZpZy50ZXJtaW5hbC5leHRlcm5hbC5saW51eEV4ZWMgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB0ZXN0U2VydmljZSA9IG5ldyBMaW51eEV4dGVybmFsVGVybWluYWxTZXJ2aWNlKCk7XG5cdFx0XHR0ZXN0U2VydmljZS5zcGF3blRlcm1pbmFsKFxuXHRcdFx0XHRtb2NrU3Bhd25lcixcblx0XHRcdFx0bW9ja0NvbmZpZy50ZXJtaW5hbC5leHRlcm5hbCxcblx0XHRcdFx0dGVzdEN3ZFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUM3QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDRCQUE0RDtBQUNyRSxTQUFTLDhCQUE4Qiw0QkFBNEIsc0NBQXNDO0FBRXpHLE1BQU0sYUFBYSxPQUFPLE9BQXVDO0FBQUEsRUFDaEUsVUFBVTtBQUFBLElBQ1QsY0FBYztBQUFBLElBQ2QsVUFBVTtBQUFBLE1BQ1QsYUFBYTtBQUFBLE1BQ2IsU0FBUztBQUFBLE1BQ1QsV0FBVztBQUFBLElBQ1o7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVELE1BQU0sMkJBQTJCLE1BQU07QUFDdEMsMENBQXdDO0FBRXhDLE9BQUsseURBQXlELFVBQVE7QUFDckUsVUFBTSxZQUFZO0FBQ2xCLFVBQU0sVUFBVTtBQUNoQixVQUFNLGNBQW1CO0FBQUEsTUFDeEIsT0FBTyxDQUFDLFNBQWMsTUFBVyxTQUFjO0FBQzlDLG9CQUFZLFNBQVMsV0FBVyw2QkFBNkI7QUFDN0Qsb0JBQVksS0FBSyxLQUFLLFNBQVMsQ0FBQyxHQUFHLFdBQVcsU0FBUyxTQUFTLFdBQVc7QUFDM0Usb0JBQVksS0FBSyxLQUFLLE9BQU87QUFDN0IsYUFBSztBQUNMLGVBQU87QUFBQSxVQUNO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
