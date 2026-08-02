import assert from "assert";
import { findPorts, getRootProcesses, getSockets, loadConnectionTable, loadListeningPorts, parseIpAddress, tryFindRootPorts } from "../../node/extHostTunnelService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
const tcp = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
	0: 00000000:0BBA 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2335214 1 0000000010173312 100 0 0 10 0
	1: 00000000:1AF3 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334514 1 000000008815920b 100 0 0 10 0
	2: 0100007F:A9EA 0100007F:1AF3 01 00000000:00000000 00:00000000 00000000  1000        0 2334521 1 00000000a37d44c6 21 4 0 10 -1
	3: 0100007F:E8B4 0100007F:98EF 01 00000000:00000000 00:00000000 00000000  1000        0 2334532 1 0000000031b88f06 21 4 0 10 -1
	4: 0100007F:866C 0100007F:8783 01 00000000:00000000 00:00000000 00000000  1000        0 2334510 1 00000000cbf670bb 21 4 30 10 -1
	5: 0100007F:1AF3 0100007F:A9EA 01 00000000:00000000 00:00000000 00000000  1000        0 2338989 1 0000000000bace62 21 4 1 10 -1
`;
const tcp6 = `  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
	0: 00000000000000000000000000000000:815B 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2321070 1 00000000c44f3f02 100 0 0 10 0
	1: 00000000000000000000000000000000:8783 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334509 1 000000003915e812 100 0 0 10 0
	2: 00000000000000000000000000000000:9907 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2284465 1 00000000f13b9374 100 0 0 10 0
	3: 00000000000000000000000000000000:98EF 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2334531 1 00000000184cae9c 100 0 0 10 0
	4: 00000000000000000000000000000000:8BCF 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 2329890 1 00000000c05a3466 100 0 0 10 0
	5: 0000000000000000FFFF00000100007F:8783 0000000000000000FFFF00000100007F:866C 01 00000000:00000000 00:00000000 00000000  1000        0 2334511 1 00000000bf547132 21 4 1 10 -1
	6: 0000000000000000FFFF00000100007F:98EF 0000000000000000FFFF00000100007F:E8B4 01 00000000:00000000 00:00000000 00000000  1000        0 2334533 1 0000000039d0bcd2 21 4 1 10 -1
	7: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C123 01 0000005A:00000000 01:00000017 00000000  1000        0 2311039 3 0000000067b6c8db 23 5 25 10 52
	8: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C124 01 00000000:00000000 00:00000000 00000000  1000        0 2311040 1 00000000230bb017 25 4 30 10 28
	9: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C213 01 00000000:00000000 00:00000000 00000000  1000        0 2331501 1 00000000957fcb4a 26 4 30 10 57
	10: 0000000000000000FFFF0000DFD317AC:9907 0000000000000000FFFF000001D017AC:C214 01 00000000:00000000 00:00000000 00000000  1000        0 2331500 1 00000000d7f87ceb 25 4 28 10 -1
`;
const procSockets = `ls: cannot access '/proc/8289/fd/255': No such file or directory
			ls: cannot access '/proc/8289/fd/3': No such file or directory
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/230/fd/3 -> socket:[21862]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/0 -> socket:[2311043]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/1 -> socket:[2311045]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/19 -> socket:[2311040]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/2 -> socket:[2311047]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/20 -> socket:[2314928]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/22 -> socket:[2307042]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/24 -> socket:[2307051]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/25 -> socket:[2307044]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/27 -> socket:[2307046]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/29 -> socket:[2307053]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/3 -> socket:[2311049]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/30 -> socket:[2307048]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/32 -> socket:[2307055]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/33 -> socket:[2307067]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/34 -> socket:[2307057]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/35 -> socket:[2321483]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/37 -> socket:[2321070]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/41 -> socket:[2321485]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/42 -> socket:[2321074]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/43 -> socket:[2321487]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/44 -> socket:[2329890]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/45 -> socket:[2321489]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2504/fd/46 -> socket:[2334509]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/47 -> socket:[2334510]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/48 -> socket:[2329894]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/49 -> socket:[2334511]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/50 -> socket:[2334515]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/51 -> socket:[2334519]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/52 -> socket:[2334518]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/53 -> socket:[2334521]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/54 -> socket:[2334531]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/55 -> socket:[2334532]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/2504/fd/56 -> socket:[2334533]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2515/fd/3 -> socket:[2311053]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2719/fd/0 -> socket:[2307043]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2719/fd/1 -> socket:[2307045]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2719/fd/2 -> socket:[2307047]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2719/fd/3 -> socket:[2307049]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/0 -> socket:[2307052]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/1 -> socket:[2307054]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/2 -> socket:[2307056]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/20 -> socket:[2290617]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2725/fd/3 -> socket:[2307058]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2739/fd/0 -> socket:[2307052]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2739/fd/1 -> socket:[2307054]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2739/fd/2 -> socket:[2307056]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2739/fd/3 -> socket:[2290618]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2795/fd/0 -> socket:[2321484]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2795/fd/1 -> socket:[2321486]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2795/fd/2 -> socket:[2321488]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/2795/fd/3 -> socket:[2321490]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/18 -> socket:[2284465]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/19 -> socket:[2311039]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/23 -> socket:[2331501]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/24 -> socket:[2311052]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/25 -> socket:[2311042]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/26 -> socket:[2331504]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/27 -> socket:[2311051]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/29 -> socket:[2311044]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/314/fd/30 -> socket:[2321909]
			lrwx------ 1 alex alex 64 Dec  8 14:59 /proc/314/fd/31 -> socket:[2311046]
			lrwx------ 1 alex alex 64 Dec  8 15:14 /proc/314/fd/33 -> socket:[2311048]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/314/fd/35 -> socket:[2329692]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/314/fd/37 -> socket:[2331506]
			lrwx------ 1 alex alex 64 Dec  8 15:20 /proc/314/fd/40 -> socket:[2331508]
			lrwx------ 1 alex alex 64 Dec  8 15:20 /proc/314/fd/42 -> socket:[2331510]
			lrwx------ 1 alex alex 64 Dec  8 15:17 /proc/314/fd/68 -> socket:[2322083]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4412/fd/20 -> socket:[2335214]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/0 -> socket:[2331505]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/1 -> socket:[2331507]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/2 -> socket:[2331509]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/23 -> socket:[2334514]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/24 -> socket:[2338989]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/26 -> socket:[2338276]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/27 -> socket:[2331500]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/3 -> socket:[2331511]
			lrwx------ 1 alex alex 64 Dec  8 15:22 /proc/4496/fd/31 -> socket:[2338285]`;
const processes = [
  {
    pid: 230,
    cwd: "/mnt/c/WINDOWS/system32",
    cmd: "dockerserve--addressunix:///home/alex/.docker/run/docker-cli-api.sock"
  },
  {
    pid: 2504,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstrap-fork--type=extensionHost--transformURIs--useHostProxy="
  },
  {
    pid: 2515,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstrap-fork--type=watcherService"
  },
  {
    pid: 2526,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "/bin/bash"
  },
  {
    pid: 2719,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--max-old-space-size=3072/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_modules/typescript/lib/tsserver.js--serverModepartialSemantic--useInferredProjectPerProjectRoot--disableAutomaticTypingAcquisition--cancellationPipeName/tmp/vscode-typescript1000/7cfa7171c0c00aacf1ee/tscancellation-602cd80b954818b6a2f7.tmp*--logVerbosityverbose--logFile/home/alex/.vscode-server-insiders/data/logs/20201208T145954/exthost2/vscode.typescript-language-features/tsserver-log-nxBt2m/tsserver.log--globalPluginstypescript-vscode-sh-plugin--pluginProbeLocations/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/typescript-language-features--localeen--noGetErrOnBackgroundUpdate--validateDefaultNpmLocation"
  },
  {
    pid: 2725,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--max-old-space-size=3072/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_modules/typescript/lib/tsserver.js--useInferredProjectPerProjectRoot--enableTelemetry--cancellationPipeName/tmp/vscode-typescript1000/7cfa7171c0c00aacf1ee/tscancellation-04a0b92f880c2fd535ae.tmp*--logVerbosityverbose--logFile/home/alex/.vscode-server-insiders/data/logs/20201208T145954/exthost2/vscode.typescript-language-features/tsserver-log-fqyBrs/tsserver.log--globalPluginstypescript-vscode-sh-plugin--pluginProbeLocations/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/typescript-language-features--localeen--noGetErrOnBackgroundUpdate--validateDefaultNpmLocation"
  },
  {
    pid: 2739,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_modules/typescript/lib/typingsInstaller.js--globalTypingsCacheLocation/home/alex/.cache/typescript/4.1--enableTelemetry--logFile/home/alex/.vscode-server-insiders/data/logs/20201208T145954/exthost2/vscode.typescript-language-features/tsserver-log-fqyBrs/ti-2725.log--typesMapLocation/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/node_modules/typescript/lib/typesMap.json--validateDefaultNpmLocation"
  },
  {
    pid: 2795,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/json-language-features/server/dist/node/jsonServerMain--node-ipc--clientProcessId=2504"
  },
  {
    pid: 286,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: 'sh-c"$VSCODE_WSL_EXT_LOCATION/ scripts / wslServer.sh" bc13785d3dd99b4b0e9da9aed17bb79809a50804 insider .vscode-server-insiders 0  '
  },
  {
    pid: 287,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "sh/mnt/c/Users/alros/.vscode-insiders/extensions/ms-vscode-remote.remote-wsl-0.52.0/scripts/wslServer.shbc13785d3dd99b4b0e9da9aed17bb79809a50804insider.vscode-server-insiders0"
  },
  {
    pid: 3058,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "npm"
  },
  {
    pid: 3070,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "sh-ctsc -watch -p ./"
  },
  {
    pid: 3071,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "node/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample/node_modules/.bin/tsc-watch-p./"
  },
  {
    pid: 312,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "sh/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/server.sh--port=0--use-host-proxy--enable-remote-auto-shutdown--print-ip-address"
  },
  {
    pid: 314,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/server-main.js--port=0--use-host-proxy--enable-remote-auto-shutdown--print-ip-address"
  },
  {
    pid: 3172,
    cwd: "/home/alex",
    cmd: "/bin/bash"
  },
  {
    pid: 3610,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "/bin/bash"
  },
  {
    pid: 4412,
    cwd: "/home/alex/repos/Microsoft/vscode-extension-samples/helloworld-sample",
    cmd: "http-server"
  },
  {
    pid: 4496,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node--inspect-brk=0.0.0.0:6899/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/out/bootstrap-fork--type=extensionHost--transformURIs--useHostProxy="
  },
  {
    pid: 4507,
    cwd: "/mnt/c/Users/alros/AppData/Local/Programs/Microsoft VS Code Insiders",
    cmd: "/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/node/home/alex/.vscode-server-insiders/bin/bc13785d3dd99b4b0e9da9aed17bb79809a50804/extensions/ms-vscode.js-debug/src/hash.bundle.js"
  }
];
const psStdOut = `4 S root         1     0  0  80   0 -   596 -       1440   2 14:41 ?        00:00:00 /bin/sh -c echo Container started ; trap "exit 0" 15; while sleep 1 & wait $!; do :; done
4 S root        14     0  0  80   0 -   596 -        764   4 14:41 ?        00:00:00 /bin/sh
4 S root        40     0  0  80   0 -   596 -        700   4 14:41 ?        00:00:00 /bin/sh
4 S root       513   380  0  80   0 -  2476 -       3404   1 14:41 pts/1    00:00:00 sudo npx http-server -p 5000
4 S root       514   513  0  80   0 - 165439 -     41380   5 14:41 pts/1    00:00:00 http-server
0 S root      1052     1  0  80   0 -   573 -        752   5 14:43 ?        00:00:00 sleep 1
0 S node      1056   329  0  80   0 -   596 do_wai   764  10 14:43 ?        00:00:00 /bin/sh -c ps -F -A -l | grep root
0 S node      1058  1056  0  80   0 -   770 pipe_w   888   9 14:43 ?        00:00:00 grep root`;
suite("ExtHostTunnelService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getSockets", function() {
    const result = getSockets(procSockets);
    assert.strictEqual(Object.keys(result).length, 75);
    assert.notStrictEqual(Object.keys(result).find((key) => result[key].pid === 4412), void 0);
  });
  test("loadConnectionTable", function() {
    const result = loadConnectionTable(tcp);
    assert.strictEqual(result.length, 6);
    assert.deepStrictEqual(result[0], {
      10: "1",
      11: "0000000010173312",
      12: "100",
      13: "0",
      14: "0",
      15: "10",
      16: "0",
      inode: "2335214",
      local_address: "00000000:0BBA",
      rem_address: "00000000:0000",
      retrnsmt: "00000000",
      sl: "0:",
      st: "0A",
      timeout: "0",
      tr: "00:00000000",
      tx_queue: "00000000:00000000",
      uid: "1000"
    });
  });
  test("loadListeningPorts", function() {
    const result = loadListeningPorts(tcp, tcp6);
    assert.strictEqual(result.length, 7);
    assert.notStrictEqual(result.find((value) => value.port === 3002), void 0);
  });
  test("tryFindRootPorts", function() {
    const rootProcesses = getRootProcesses(psStdOut);
    assert.strictEqual(rootProcesses.length, 6);
    const result = tryFindRootPorts([{ socket: 1e3, ip: "127.0.0.1", port: 5e3 }], psStdOut, /* @__PURE__ */ new Map());
    assert.strictEqual(result.size, 1);
    assert.strictEqual(result.get(5e3)?.pid, 514);
  });
  test("findPorts", async function() {
    const result = await findPorts(loadListeningPorts(tcp, tcp6), getSockets(procSockets), processes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].host, "0.0.0.0");
    assert.strictEqual(result[0].port, 3002);
    assert.strictEqual(result[0].detail, "http-server");
  });
  test("parseIpAddress", function() {
    assert.strictEqual(parseIpAddress("00000000000000000000000001000000"), "0:0:0:0:0:0:0:1");
    assert.strictEqual(parseIpAddress("0000000000000000FFFF0000040510AC"), "0:0:0:0:0:ffff:ac10:504");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9ub2RlL2V4dEhvc3RUdW5uZWxTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBmaW5kUG9ydHMsIGdldFJvb3RQcm9jZXNzZXMsIGdldFNvY2tldHMsIGxvYWRDb25uZWN0aW9uVGFibGUsIGxvYWRMaXN0ZW5pbmdQb3J0cywgcGFyc2VJcEFkZHJlc3MsIHRyeUZpbmRSb290UG9ydHMgfSBmcm9tICcuLi8uLi9ub2RlL2V4dEhvc3RUdW5uZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5jb25zdCB0Y3AgPVxuXHRgICBzbCAgbG9jYWxfYWRkcmVzcyByZW1fYWRkcmVzcyAgIHN0IHR4X3F1ZXVlIHJ4X3F1ZXVlIHRyIHRtLT53aGVuIHJldHJuc210ICAgdWlkICB0aW1lb3V0IGlub2RlXG5cdDA6IDAwMDAwMDAwOjBCQkEgMDAwMDAwMDA6MDAwMCAwQSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMzM1MjE0IDEgMDAwMDAwMDAxMDE3MzMxMiAxMDAgMCAwIDEwIDBcblx0MTogMDAwMDAwMDA6MUFGMyAwMDAwMDAwMDowMDAwIDBBIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzQ1MTQgMSAwMDAwMDAwMDg4MTU5MjBiIDEwMCAwIDAgMTAgMFxuXHQyOiAwMTAwMDA3RjpBOUVBIDAxMDAwMDdGOjFBRjMgMDEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMzNDUyMSAxIDAwMDAwMDAwYTM3ZDQ0YzYgMjEgNCAwIDEwIC0xXG5cdDM6IDAxMDAwMDdGOkU4QjQgMDEwMDAwN0Y6OThFRiAwMSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMzM0NTMyIDEgMDAwMDAwMDAzMWI4OGYwNiAyMSA0IDAgMTAgLTFcblx0NDogMDEwMDAwN0Y6ODY2QyAwMTAwMDA3Rjo4NzgzIDAxIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzQ1MTAgMSAwMDAwMDAwMGNiZjY3MGJiIDIxIDQgMzAgMTAgLTFcblx0NTogMDEwMDAwN0Y6MUFGMyAwMTAwMDA3RjpBOUVBIDAxIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzg5ODkgMSAwMDAwMDAwMDAwYmFjZTYyIDIxIDQgMSAxMCAtMVxuYDtcbmNvbnN0IHRjcDYgPVxuXHRgICBzbCAgbG9jYWxfYWRkcmVzcyAgICAgICAgICAgICAgICAgICAgICAgICByZW1vdGVfYWRkcmVzcyAgICAgICAgICAgICAgICAgICAgICAgIHN0IHR4X3F1ZXVlIHJ4X3F1ZXVlIHRyIHRtLT53aGVuIHJldHJuc210ICAgdWlkICB0aW1lb3V0IGlub2RlXG5cdDA6IDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOjgxNUIgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA6MDAwMCAwQSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMzIxMDcwIDEgMDAwMDAwMDBjNDRmM2YwMiAxMDAgMCAwIDEwIDBcblx0MTogMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA6ODc4MyAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDowMDAwIDBBIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzQ1MDkgMSAwMDAwMDAwMDM5MTVlODEyIDEwMCAwIDAgMTAgMFxuXHQyOiAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDo5OTA3IDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOjAwMDAgMEEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjI4NDQ2NSAxIDAwMDAwMDAwZjEzYjkzNzQgMTAwIDAgMCAxMCAwXG5cdDM6IDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwOjk4RUYgMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA6MDAwMCAwQSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMzM0NTMxIDEgMDAwMDAwMDAxODRjYWU5YyAxMDAgMCAwIDEwIDBcblx0NDogMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA6OEJDRiAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDowMDAwIDBBIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMjk4OTAgMSAwMDAwMDAwMGMwNWEzNDY2IDEwMCAwIDAgMTAgMFxuXHQ1OiAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDAwMTAwMDA3Rjo4NzgzIDAwMDAwMDAwMDAwMDAwMDBGRkZGMDAwMDAxMDAwMDdGOjg2NkMgMDEgMDAwMDAwMDA6MDAwMDAwMDAgMDA6MDAwMDAwMDAgMDAwMDAwMDAgIDEwMDAgICAgICAgIDAgMjMzNDUxMSAxIDAwMDAwMDAwYmY1NDcxMzIgMjEgNCAxIDEwIC0xXG5cdDY6IDAwMDAwMDAwMDAwMDAwMDBGRkZGMDAwMDAxMDAwMDdGOjk4RUYgMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwMDEwMDAwN0Y6RThCNCAwMSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMzM0NTMzIDEgMDAwMDAwMDAzOWQwYmNkMiAyMSA0IDEgMTAgLTFcblx0NzogMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwREZEMzE3QUM6OTkwNyAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDAwMUQwMTdBQzpDMTIzIDAxIDAwMDAwMDVBOjAwMDAwMDAwIDAxOjAwMDAwMDE3IDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMTEwMzkgMyAwMDAwMDAwMDY3YjZjOGRiIDIzIDUgMjUgMTAgNTJcblx0ODogMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwREZEMzE3QUM6OTkwNyAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDAwMUQwMTdBQzpDMTI0IDAxIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMTEwNDAgMSAwMDAwMDAwMDIzMGJiMDE3IDI1IDQgMzAgMTAgMjhcblx0OTogMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwREZEMzE3QUM6OTkwNyAwMDAwMDAwMDAwMDAwMDAwRkZGRjAwMDAwMUQwMTdBQzpDMjEzIDAxIDAwMDAwMDAwOjAwMDAwMDAwIDAwOjAwMDAwMDAwIDAwMDAwMDAwICAxMDAwICAgICAgICAwIDIzMzE1MDEgMSAwMDAwMDAwMDk1N2ZjYjRhIDI2IDQgMzAgMTAgNTdcblx0MTA6IDAwMDAwMDAwMDAwMDAwMDBGRkZGMDAwMERGRDMxN0FDOjk5MDcgMDAwMDAwMDAwMDAwMDAwMEZGRkYwMDAwMDFEMDE3QUM6QzIxNCAwMSAwMDAwMDAwMDowMDAwMDAwMCAwMDowMDAwMDAwMCAwMDAwMDAwMCAgMTAwMCAgICAgICAgMCAyMzMxNTAwIDEgMDAwMDAwMDBkN2Y4N2NlYiAyNSA0IDI4IDEwIC0xXG5gO1xuXG5jb25zdCBwcm9jU29ja2V0cyA9XG5cdGBsczogY2Fubm90IGFjY2VzcyAnL3Byb2MvODI4OS9mZC8yNTUnOiBObyBzdWNoIGZpbGUgb3IgZGlyZWN0b3J5XG5cdFx0XHRsczogY2Fubm90IGFjY2VzcyAnL3Byb2MvODI4OS9mZC8zJzogTm8gc3VjaCBmaWxlIG9yIGRpcmVjdG9yeVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTQ6NTkgL3Byb2MvMjMwL2ZkLzMgLT4gc29ja2V0OlsyMTg2Ml1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMCAtPiBzb2NrZXQ6WzIzMTEwNDNdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzEgLT4gc29ja2V0OlsyMzExMDQ1XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8xOSAtPiBzb2NrZXQ6WzIzMTEwNDBdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzIgLT4gc29ja2V0OlsyMzExMDQ3XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8yMCAtPiBzb2NrZXQ6WzIzMTQ5MjhdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzIyIC0+IHNvY2tldDpbMjMwNzA0Ml1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMjQgLT4gc29ja2V0OlsyMzA3MDUxXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8yNSAtPiBzb2NrZXQ6WzIzMDcwNDRdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzI3IC0+IHNvY2tldDpbMjMwNzA0Nl1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMjkgLT4gc29ja2V0OlsyMzA3MDUzXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8zIC0+IHNvY2tldDpbMjMxMTA0OV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMzAgLT4gc29ja2V0OlsyMzA3MDQ4XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8zMiAtPiBzb2NrZXQ6WzIzMDcwNTVdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzMzIC0+IHNvY2tldDpbMjMwNzA2N11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvMzQgLT4gc29ja2V0OlsyMzA3MDU3XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC8zNSAtPiBzb2NrZXQ6WzIzMjE0ODNdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzM3IC0+IHNvY2tldDpbMjMyMTA3MF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvNDEgLT4gc29ja2V0OlsyMzIxNDg1XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC80MiAtPiBzb2NrZXQ6WzIzMjEwNzRdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzQzIC0+IHNvY2tldDpbMjMyMTQ4N11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI1MDQvZmQvNDQgLT4gc29ja2V0OlsyMzI5ODkwXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUwNC9mZC80NSAtPiBzb2NrZXQ6WzIzMjE0ODldXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNTA0L2ZkLzQ2IC0+IHNvY2tldDpbMjMzNDUwOV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzI1MDQvZmQvNDcgLT4gc29ja2V0OlsyMzM0NTEwXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMjUwNC9mZC80OCAtPiBzb2NrZXQ6WzIzMjk4OTRdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNyAvcHJvYy8yNTA0L2ZkLzQ5IC0+IHNvY2tldDpbMjMzNDUxMV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzI1MDQvZmQvNTAgLT4gc29ja2V0OlsyMzM0NTE1XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMjUwNC9mZC81MSAtPiBzb2NrZXQ6WzIzMzQ1MTldXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNyAvcHJvYy8yNTA0L2ZkLzUyIC0+IHNvY2tldDpbMjMzNDUxOF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzI1MDQvZmQvNTMgLT4gc29ja2V0OlsyMzM0NTIxXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMjUwNC9mZC81NCAtPiBzb2NrZXQ6WzIzMzQ1MzFdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNyAvcHJvYy8yNTA0L2ZkLzU1IC0+IHNvY2tldDpbMjMzNDUzMl1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzI1MDQvZmQvNTYgLT4gc29ja2V0OlsyMzM0NTMzXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjUxNS9mZC8zIC0+IHNvY2tldDpbMjMxMTA1M11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MTkvZmQvMCAtPiBzb2NrZXQ6WzIzMDcwNDNdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzE5L2ZkLzEgLT4gc29ja2V0OlsyMzA3MDQ1XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjcxOS9mZC8yIC0+IHNvY2tldDpbMjMwNzA0N11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MTkvZmQvMyAtPiBzb2NrZXQ6WzIzMDcwNDldXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzI1L2ZkLzAgLT4gc29ja2V0OlsyMzA3MDUyXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjcyNS9mZC8xIC0+IHNvY2tldDpbMjMwNzA1NF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MjUvZmQvMiAtPiBzb2NrZXQ6WzIzMDcwNTZdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzI1L2ZkLzIwIC0+IHNvY2tldDpbMjI5MDYxN11cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MjUvZmQvMyAtPiBzb2NrZXQ6WzIzMDcwNThdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzM5L2ZkLzAgLT4gc29ja2V0OlsyMzA3MDUyXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjczOS9mZC8xIC0+IHNvY2tldDpbMjMwNzA1NF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3MzkvZmQvMiAtPiBzb2NrZXQ6WzIzMDcwNTZdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzM5L2ZkLzMgLT4gc29ja2V0OlsyMjkwNjE4XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjc5NS9mZC8wIC0+IHNvY2tldDpbMjMyMTQ4NF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE0IC9wcm9jLzI3OTUvZmQvMSAtPiBzb2NrZXQ6WzIzMjE0ODZdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8yNzk1L2ZkLzIgLT4gc29ja2V0OlsyMzIxNDg4XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMjc5NS9mZC8zIC0+IHNvY2tldDpbMjMyMTQ5MF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE0OjU5IC9wcm9jLzMxNC9mZC8xOCAtPiBzb2NrZXQ6WzIyODQ0NjVdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNDo1OSAvcHJvYy8zMTQvZmQvMTkgLT4gc29ja2V0OlsyMzExMDM5XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTQ6NTkgL3Byb2MvMzE0L2ZkLzIzIC0+IHNvY2tldDpbMjMzMTUwMV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE0OjU5IC9wcm9jLzMxNC9mZC8yNCAtPiBzb2NrZXQ6WzIzMTEwNTJdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNDo1OSAvcHJvYy8zMTQvZmQvMjUgLT4gc29ja2V0OlsyMzExMDQyXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTQ6NTkgL3Byb2MvMzE0L2ZkLzI2IC0+IHNvY2tldDpbMjMzMTUwNF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE0OjU5IC9wcm9jLzMxNC9mZC8yNyAtPiBzb2NrZXQ6WzIzMTEwNTFdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNDo1OSAvcHJvYy8zMTQvZmQvMjkgLT4gc29ja2V0OlsyMzExMDQ0XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTQgL3Byb2MvMzE0L2ZkLzMwIC0+IHNvY2tldDpbMjMyMTkwOV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE0OjU5IC9wcm9jLzMxNC9mZC8zMSAtPiBzb2NrZXQ6WzIzMTEwNDZdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToxNCAvcHJvYy8zMTQvZmQvMzMgLT4gc29ja2V0OlsyMzExMDQ4XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MTcgL3Byb2MvMzE0L2ZkLzM1IC0+IHNvY2tldDpbMjMyOTY5Ml1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzMxNC9mZC8zNyAtPiBzb2NrZXQ6WzIzMzE1MDZdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToyMCAvcHJvYy8zMTQvZmQvNDAgLT4gc29ja2V0OlsyMzMxNTA4XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MjAgL3Byb2MvMzE0L2ZkLzQyIC0+IHNvY2tldDpbMjMzMTUxMF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjE3IC9wcm9jLzMxNC9mZC82OCAtPiBzb2NrZXQ6WzIzMjIwODNdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToyMiAvcHJvYy80NDEyL2ZkLzIwIC0+IHNvY2tldDpbMjMzNTIxNF1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjIyIC9wcm9jLzQ0OTYvZmQvMCAtPiBzb2NrZXQ6WzIzMzE1MDVdXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToyMiAvcHJvYy80NDk2L2ZkLzEgLT4gc29ja2V0OlsyMzMxNTA3XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MjIgL3Byb2MvNDQ5Ni9mZC8yIC0+IHNvY2tldDpbMjMzMTUwOV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjIyIC9wcm9jLzQ0OTYvZmQvMjMgLT4gc29ja2V0OlsyMzM0NTE0XVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MjIgL3Byb2MvNDQ5Ni9mZC8yNCAtPiBzb2NrZXQ6WzIzMzg5ODldXG5cdFx0XHRscnd4LS0tLS0tIDEgYWxleCBhbGV4IDY0IERlYyAgOCAxNToyMiAvcHJvYy80NDk2L2ZkLzI2IC0+IHNvY2tldDpbMjMzODI3Nl1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjIyIC9wcm9jLzQ0OTYvZmQvMjcgLT4gc29ja2V0OlsyMzMxNTAwXVxuXHRcdFx0bHJ3eC0tLS0tLSAxIGFsZXggYWxleCA2NCBEZWMgIDggMTU6MjIgL3Byb2MvNDQ5Ni9mZC8zIC0+IHNvY2tldDpbMjMzMTUxMV1cblx0XHRcdGxyd3gtLS0tLS0gMSBhbGV4IGFsZXggNjQgRGVjICA4IDE1OjIyIC9wcm9jLzQ0OTYvZmQvMzEgLT4gc29ja2V0OlsyMzM4Mjg1XWA7XG5cbmNvbnN0IHByb2Nlc3NlczogeyBwaWQ6IG51bWJlcjsgY3dkOiBzdHJpbmc7IGNtZDogc3RyaW5nIH1bXSA9IFtcblx0e1xuXHRcdHBpZDogMjMwLFxuXHRcdGN3ZDogJy9tbnQvYy9XSU5ET1dTL3N5c3RlbTMyJyxcblx0XHRjbWQ6ICdkb2NrZXJzZXJ2ZS0tYWRkcmVzc3VuaXg6Ly8vaG9tZS9hbGV4Ly5kb2NrZXIvcnVuL2RvY2tlci1jbGktYXBpLnNvY2snLFxuXHR9LFxuXHR7XG5cdFx0cGlkOiAyNTA0LFxuXHRcdGN3ZDogJy9tbnQvYy9Vc2Vycy9hbHJvcy9BcHBEYXRhL0xvY2FsL1Byb2dyYW1zL01pY3Jvc29mdCBWUyBDb2RlIEluc2lkZXJzJyxcblx0XHRjbWQ6ICcvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L25vZGUvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L291dC9ib290c3RyYXAtZm9yay0tdHlwZT1leHRlbnNpb25Ib3N0LS10cmFuc2Zvcm1VUklzLS11c2VIb3N0UHJveHk9Jyxcblx0fSxcblx0e1xuXHRcdHBpZDogMjUxNSxcblx0XHRjd2Q6ICcvbW50L2MvVXNlcnMvYWxyb3MvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQgVlMgQ29kZSBJbnNpZGVycycsXG5cdFx0Y21kOiAnL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9ub2RlL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9vdXQvYm9vdHN0cmFwLWZvcmstLXR5cGU9d2F0Y2hlclNlcnZpY2UnXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDI1MjYsXG5cdFx0Y3dkOiAnL2hvbWUvYWxleC9yZXBvcy9NaWNyb3NvZnQvdnNjb2RlLWV4dGVuc2lvbi1zYW1wbGVzL2hlbGxvd29ybGQtc2FtcGxlJyxcblx0XHRjbWQ6ICcvYmluL2Jhc2gnXG5cdH0sIHtcblx0XHRwaWQ6IDI3MTksXG5cdFx0Y3dkOiAnL21udC9jL1VzZXJzL2Fscm9zL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnMnLFxuXHRcdGNtZDogJy9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvbm9kZS0tbWF4LW9sZC1zcGFjZS1zaXplPTMwNzIvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L2V4dGVuc2lvbnMvbm9kZV9tb2R1bGVzL3R5cGVzY3JpcHQvbGliL3Rzc2VydmVyLmpzLS1zZXJ2ZXJNb2RlcGFydGlhbFNlbWFudGljLS11c2VJbmZlcnJlZFByb2plY3RQZXJQcm9qZWN0Um9vdC0tZGlzYWJsZUF1dG9tYXRpY1R5cGluZ0FjcXVpc2l0aW9uLS1jYW5jZWxsYXRpb25QaXBlTmFtZS90bXAvdnNjb2RlLXR5cGVzY3JpcHQxMDAwLzdjZmE3MTcxYzBjMDBhYWNmMWVlL3RzY2FuY2VsbGF0aW9uLTYwMmNkODBiOTU0ODE4YjZhMmY3LnRtcCotLWxvZ1ZlcmJvc2l0eXZlcmJvc2UtLWxvZ0ZpbGUvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2RhdGEvbG9ncy8yMDIwMTIwOFQxNDU5NTQvZXh0aG9zdDIvdnNjb2RlLnR5cGVzY3JpcHQtbGFuZ3VhZ2UtZmVhdHVyZXMvdHNzZXJ2ZXItbG9nLW54QnQybS90c3NlcnZlci5sb2ctLWdsb2JhbFBsdWdpbnN0eXBlc2NyaXB0LXZzY29kZS1zaC1wbHVnaW4tLXBsdWdpblByb2JlTG9jYXRpb25zL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9leHRlbnNpb25zL3R5cGVzY3JpcHQtbGFuZ3VhZ2UtZmVhdHVyZXMtLWxvY2FsZWVuLS1ub0dldEVyck9uQmFja2dyb3VuZFVwZGF0ZS0tdmFsaWRhdGVEZWZhdWx0TnBtTG9jYXRpb24nXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDI3MjUsXG5cdFx0Y3dkOiAnL21udC9jL1VzZXJzL2Fscm9zL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnMnLFxuXHRcdGNtZDogJy9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvbm9kZS0tbWF4LW9sZC1zcGFjZS1zaXplPTMwNzIvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L2V4dGVuc2lvbnMvbm9kZV9tb2R1bGVzL3R5cGVzY3JpcHQvbGliL3Rzc2VydmVyLmpzLS11c2VJbmZlcnJlZFByb2plY3RQZXJQcm9qZWN0Um9vdC0tZW5hYmxlVGVsZW1ldHJ5LS1jYW5jZWxsYXRpb25QaXBlTmFtZS90bXAvdnNjb2RlLXR5cGVzY3JpcHQxMDAwLzdjZmE3MTcxYzBjMDBhYWNmMWVlL3RzY2FuY2VsbGF0aW9uLTA0YTBiOTJmODgwYzJmZDUzNWFlLnRtcCotLWxvZ1ZlcmJvc2l0eXZlcmJvc2UtLWxvZ0ZpbGUvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2RhdGEvbG9ncy8yMDIwMTIwOFQxNDU5NTQvZXh0aG9zdDIvdnNjb2RlLnR5cGVzY3JpcHQtbGFuZ3VhZ2UtZmVhdHVyZXMvdHNzZXJ2ZXItbG9nLWZxeUJycy90c3NlcnZlci5sb2ctLWdsb2JhbFBsdWdpbnN0eXBlc2NyaXB0LXZzY29kZS1zaC1wbHVnaW4tLXBsdWdpblByb2JlTG9jYXRpb25zL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9leHRlbnNpb25zL3R5cGVzY3JpcHQtbGFuZ3VhZ2UtZmVhdHVyZXMtLWxvY2FsZWVuLS1ub0dldEVyck9uQmFja2dyb3VuZFVwZGF0ZS0tdmFsaWRhdGVEZWZhdWx0TnBtTG9jYXRpb24nXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDI3MzksXG5cdFx0Y3dkOiAnL21udC9jL1VzZXJzL2Fscm9zL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnMnLFxuXHRcdGNtZDogJy9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvbm9kZS9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvZXh0ZW5zaW9ucy9ub2RlX21vZHVsZXMvdHlwZXNjcmlwdC9saWIvdHlwaW5nc0luc3RhbGxlci5qcy0tZ2xvYmFsVHlwaW5nc0NhY2hlTG9jYXRpb24vaG9tZS9hbGV4Ly5jYWNoZS90eXBlc2NyaXB0LzQuMS0tZW5hYmxlVGVsZW1ldHJ5LS1sb2dGaWxlL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9kYXRhL2xvZ3MvMjAyMDEyMDhUMTQ1OTU0L2V4dGhvc3QyL3ZzY29kZS50eXBlc2NyaXB0LWxhbmd1YWdlLWZlYXR1cmVzL3Rzc2VydmVyLWxvZy1mcXlCcnMvdGktMjcyNS5sb2ctLXR5cGVzTWFwTG9jYXRpb24vaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L2V4dGVuc2lvbnMvbm9kZV9tb2R1bGVzL3R5cGVzY3JpcHQvbGliL3R5cGVzTWFwLmpzb24tLXZhbGlkYXRlRGVmYXVsdE5wbUxvY2F0aW9uJ1xuXHR9LFxuXHR7XG5cdFx0cGlkOiAyNzk1LFxuXHRcdGN3ZDogJy9ob21lL2FsZXgvcmVwb3MvTWljcm9zb2Z0L3ZzY29kZS1leHRlbnNpb24tc2FtcGxlcy9oZWxsb3dvcmxkLXNhbXBsZScsXG5cdFx0Y21kOiAnL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9ub2RlL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9leHRlbnNpb25zL2pzb24tbGFuZ3VhZ2UtZmVhdHVyZXMvc2VydmVyL2Rpc3Qvbm9kZS9qc29uU2VydmVyTWFpbi0tbm9kZS1pcGMtLWNsaWVudFByb2Nlc3NJZD0yNTA0J1xuXHR9LFxuXHR7XG5cdFx0cGlkOiAyODYsXG5cdFx0Y3dkOiAnL21udC9jL1VzZXJzL2Fscm9zL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnMnLFxuXHRcdGNtZDogJ3NoLWNcXFwiJFZTQ09ERV9XU0xfRVhUX0xPQ0FUSU9OLyBzY3JpcHRzIC8gd3NsU2VydmVyLnNoXFxcIiBiYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0IGluc2lkZXIgLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMgMCAgJ1xuXHR9LFxuXHR7XG5cdFx0cGlkOiAyODcsXG5cdFx0Y3dkOiAnL21udC9jL1VzZXJzL2Fscm9zL0FwcERhdGEvTG9jYWwvUHJvZ3JhbXMvTWljcm9zb2Z0IFZTIENvZGUgSW5zaWRlcnMnLFxuXHRcdGNtZDogJ3NoL21udC9jL1VzZXJzL2Fscm9zLy52c2NvZGUtaW5zaWRlcnMvZXh0ZW5zaW9ucy9tcy12c2NvZGUtcmVtb3RlLnJlbW90ZS13c2wtMC41Mi4wL3NjcmlwdHMvd3NsU2VydmVyLnNoYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNGluc2lkZXIudnNjb2RlLXNlcnZlci1pbnNpZGVyczAnXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDMwNTgsXG5cdFx0Y3dkOiAnL2hvbWUvYWxleC9yZXBvcy9NaWNyb3NvZnQvdnNjb2RlLWV4dGVuc2lvbi1zYW1wbGVzL2hlbGxvd29ybGQtc2FtcGxlJyxcblx0XHRjbWQ6ICducG0nXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDMwNzAsXG5cdFx0Y3dkOiAnL2hvbWUvYWxleC9yZXBvcy9NaWNyb3NvZnQvdnNjb2RlLWV4dGVuc2lvbi1zYW1wbGVzL2hlbGxvd29ybGQtc2FtcGxlJyxcblx0XHRjbWQ6ICdzaC1jdHNjIC13YXRjaCAtcCAuLydcblx0fSxcblx0e1xuXHRcdHBpZDogMzA3MSxcblx0XHRjd2Q6ICcvaG9tZS9hbGV4L3JlcG9zL01pY3Jvc29mdC92c2NvZGUtZXh0ZW5zaW9uLXNhbXBsZXMvaGVsbG93b3JsZC1zYW1wbGUnLFxuXHRcdGNtZDogJ25vZGUvaG9tZS9hbGV4L3JlcG9zL01pY3Jvc29mdC92c2NvZGUtZXh0ZW5zaW9uLXNhbXBsZXMvaGVsbG93b3JsZC1zYW1wbGUvbm9kZV9tb2R1bGVzLy5iaW4vdHNjLXdhdGNoLXAuLydcblx0fSxcblx0e1xuXHRcdHBpZDogMzEyLFxuXHRcdGN3ZDogJy9tbnQvYy9Vc2Vycy9hbHJvcy9BcHBEYXRhL0xvY2FsL1Byb2dyYW1zL01pY3Jvc29mdCBWUyBDb2RlIEluc2lkZXJzJyxcblx0XHRjbWQ6ICdzaC9ob21lL2FsZXgvLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMvYmluL2JjMTM3ODVkM2RkOTliNGIwZTlkYTlhZWQxN2JiNzk4MDlhNTA4MDQvc2VydmVyLnNoLS1wb3J0PTAtLXVzZS1ob3N0LXByb3h5LS1lbmFibGUtcmVtb3RlLWF1dG8tc2h1dGRvd24tLXByaW50LWlwLWFkZHJlc3MnXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDMxNCxcblx0XHRjd2Q6ICcvbW50L2MvVXNlcnMvYWxyb3MvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQgVlMgQ29kZSBJbnNpZGVycycsXG5cdFx0Y21kOiAnL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9ub2RlL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9vdXQvc2VydmVyLW1haW4uanMtLXBvcnQ9MC0tdXNlLWhvc3QtcHJveHktLWVuYWJsZS1yZW1vdGUtYXV0by1zaHV0ZG93bi0tcHJpbnQtaXAtYWRkcmVzcydcblx0fSxcblx0e1xuXHRcdHBpZDogMzE3Mixcblx0XHRjd2Q6ICcvaG9tZS9hbGV4Jyxcblx0XHRjbWQ6ICcvYmluL2Jhc2gnXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDM2MTAsXG5cdFx0Y3dkOiAnL2hvbWUvYWxleC9yZXBvcy9NaWNyb3NvZnQvdnNjb2RlLWV4dGVuc2lvbi1zYW1wbGVzL2hlbGxvd29ybGQtc2FtcGxlJyxcblx0XHRjbWQ6ICcvYmluL2Jhc2gnXG5cdH0sXG5cdHtcblx0XHRwaWQ6IDQ0MTIsXG5cdFx0Y3dkOiAnL2hvbWUvYWxleC9yZXBvcy9NaWNyb3NvZnQvdnNjb2RlLWV4dGVuc2lvbi1zYW1wbGVzL2hlbGxvd29ybGQtc2FtcGxlJyxcblx0XHRjbWQ6ICdodHRwLXNlcnZlcidcblx0fSxcblx0e1xuXHRcdHBpZDogNDQ5Nixcblx0XHRjd2Q6ICcvbW50L2MvVXNlcnMvYWxyb3MvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQgVlMgQ29kZSBJbnNpZGVycycsXG5cdFx0Y21kOiAnL2hvbWUvYWxleC8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9iaW4vYmMxMzc4NWQzZGQ5OWI0YjBlOWRhOWFlZDE3YmI3OTgwOWE1MDgwNC9ub2RlLS1pbnNwZWN0LWJyaz0wLjAuMC4wOjY4OTkvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L291dC9ib290c3RyYXAtZm9yay0tdHlwZT1leHRlbnNpb25Ib3N0LS10cmFuc2Zvcm1VUklzLS11c2VIb3N0UHJveHk9J1xuXHR9LFxuXHR7XG5cdFx0cGlkOiA0NTA3LFxuXHRcdGN3ZDogJy9tbnQvYy9Vc2Vycy9hbHJvcy9BcHBEYXRhL0xvY2FsL1Byb2dyYW1zL01pY3Jvc29mdCBWUyBDb2RlIEluc2lkZXJzJyxcblx0XHRjbWQ6ICcvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L25vZGUvaG9tZS9hbGV4Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2Jpbi9iYzEzNzg1ZDNkZDk5YjRiMGU5ZGE5YWVkMTdiYjc5ODA5YTUwODA0L2V4dGVuc2lvbnMvbXMtdnNjb2RlLmpzLWRlYnVnL3NyYy9oYXNoLmJ1bmRsZS5qcydcblx0fVxuXTtcblxuY29uc3QgcHNTdGRPdXQgPVxuXHRgNCBTIHJvb3QgICAgICAgICAxICAgICAwICAwICA4MCAgIDAgLSAgIDU5NiAtICAgICAgIDE0NDAgICAyIDE0OjQxID8gICAgICAgIDAwOjAwOjAwIC9iaW4vc2ggLWMgZWNobyBDb250YWluZXIgc3RhcnRlZCA7IHRyYXAgXCJleGl0IDBcIiAxNTsgd2hpbGUgc2xlZXAgMSAmIHdhaXQgJCE7IGRvIDo7IGRvbmVcbjQgUyByb290ICAgICAgICAxNCAgICAgMCAgMCAgODAgICAwIC0gICA1OTYgLSAgICAgICAgNzY0ICAgNCAxNDo0MSA/ICAgICAgICAwMDowMDowMCAvYmluL3NoXG40IFMgcm9vdCAgICAgICAgNDAgICAgIDAgIDAgIDgwICAgMCAtICAgNTk2IC0gICAgICAgIDcwMCAgIDQgMTQ6NDEgPyAgICAgICAgMDA6MDA6MDAgL2Jpbi9zaFxuNCBTIHJvb3QgICAgICAgNTEzICAgMzgwICAwICA4MCAgIDAgLSAgMjQ3NiAtICAgICAgIDM0MDQgICAxIDE0OjQxIHB0cy8xICAgIDAwOjAwOjAwIHN1ZG8gbnB4IGh0dHAtc2VydmVyIC1wIDUwMDBcbjQgUyByb290ICAgICAgIDUxNCAgIDUxMyAgMCAgODAgICAwIC0gMTY1NDM5IC0gICAgIDQxMzgwICAgNSAxNDo0MSBwdHMvMSAgICAwMDowMDowMCBodHRwLXNlcnZlclxuMCBTIHJvb3QgICAgICAxMDUyICAgICAxICAwICA4MCAgIDAgLSAgIDU3MyAtICAgICAgICA3NTIgICA1IDE0OjQzID8gICAgICAgIDAwOjAwOjAwIHNsZWVwIDFcbjAgUyBub2RlICAgICAgMTA1NiAgIDMyOSAgMCAgODAgICAwIC0gICA1OTYgZG9fd2FpICAgNzY0ICAxMCAxNDo0MyA/ICAgICAgICAwMDowMDowMCAvYmluL3NoIC1jIHBzIC1GIC1BIC1sIHwgZ3JlcCByb290XG4wIFMgbm9kZSAgICAgIDEwNTggIDEwNTYgIDAgIDgwICAgMCAtICAgNzcwIHBpcGVfdyAgIDg4OCAgIDkgMTQ6NDMgPyAgICAgICAgMDA6MDA6MDAgZ3JlcCByb290YDtcblxuc3VpdGUoJ0V4dEhvc3RUdW5uZWxTZXJ2aWNlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVzdCgnZ2V0U29ja2V0cycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXRTb2NrZXRzKHByb2NTb2NrZXRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoT2JqZWN0LmtleXMocmVzdWx0KS5sZW5ndGgsIDc1KTtcblx0XHQvLyA0NDEyIGlzIHRoZSBwaWQgb2YgdGhlIGh0dHAtc2VydmVyIGluIHRoZSB0ZXN0IGRhdGFcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoT2JqZWN0LmtleXMocmVzdWx0KS5maW5kKGtleSA9PiByZXN1bHRba2V5XS5waWQgPT09IDQ0MTIpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2FkQ29ubmVjdGlvblRhYmxlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGxvYWRDb25uZWN0aW9uVGFibGUodGNwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRbMF0sIHtcblx0XHRcdDEwOiAnMScsXG5cdFx0XHQxMTogJzAwMDAwMDAwMTAxNzMzMTInLFxuXHRcdFx0MTI6ICcxMDAnLFxuXHRcdFx0MTM6ICcwJyxcblx0XHRcdDE0OiAnMCcsXG5cdFx0XHQxNTogJzEwJyxcblx0XHRcdDE2OiAnMCcsXG5cdFx0XHRpbm9kZTogJzIzMzUyMTQnLFxuXHRcdFx0bG9jYWxfYWRkcmVzczogJzAwMDAwMDAwOjBCQkEnLFxuXHRcdFx0cmVtX2FkZHJlc3M6ICcwMDAwMDAwMDowMDAwJyxcblx0XHRcdHJldHJuc210OiAnMDAwMDAwMDAnLFxuXHRcdFx0c2w6ICcwOicsXG5cdFx0XHRzdDogJzBBJyxcblx0XHRcdHRpbWVvdXQ6ICcwJyxcblx0XHRcdHRyOiAnMDA6MDAwMDAwMDAnLFxuXHRcdFx0dHhfcXVldWU6ICcwMDAwMDAwMDowMDAwMDAwMCcsXG5cdFx0XHR1aWQ6ICcxMDAwJ1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2FkTGlzdGVuaW5nUG9ydHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbG9hZExpc3RlbmluZ1BvcnRzKHRjcCwgdGNwNik7XG5cdFx0Ly8gVGhlcmUgc2hvdWxkIGJlIDcgYmFzZWQgb24gdGhlIGlucHV0IGRhdGEuIE9uZSBvZiB0aGVtIHNob3VsZCBiZSAzMDAyLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA3KTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVzdWx0LmZpbmQodmFsdWUgPT4gdmFsdWUucG9ydCA9PT0gMzAwMiksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyeUZpbmRSb290UG9ydHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgcm9vdFByb2Nlc3NlcyA9IGdldFJvb3RQcm9jZXNzZXMocHNTdGRPdXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290UHJvY2Vzc2VzLmxlbmd0aCwgNik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdHJ5RmluZFJvb3RQb3J0cyhbeyBzb2NrZXQ6IDEwMDAsIGlwOiAnMTI3LjAuMC4xJywgcG9ydDogNTAwMCB9XSwgcHNTdGRPdXQsIG5ldyBNYXAoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zaXplLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmdldCg1MDAwKT8ucGlkLCA1MTQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUG9ydHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmluZFBvcnRzKGxvYWRMaXN0ZW5pbmdQb3J0cyh0Y3AsIHRjcDYpLCBnZXRTb2NrZXRzKHByb2NTb2NrZXRzKSwgcHJvY2Vzc2VzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5ob3N0LCAnMC4wLjAuMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ucG9ydCwgMzAwMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5kZXRhaWwsICdodHRwLXNlcnZlcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZUlwQWRkcmVzcycsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VJcEFkZHJlc3MoJzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAxMDAwMDAwJyksICcwOjA6MDowOjA6MDowOjEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VJcEFkZHJlc3MoJzAwMDAwMDAwMDAwMDAwMDBGRkZGMDAwMDA0MDUxMEFDJyksICcwOjA6MDowOjA6ZmZmZjphYzEwOjUwNCcpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVyxrQkFBa0IsWUFBWSxxQkFBcUIsb0JBQW9CLGdCQUFnQix3QkFBd0I7QUFDbkksU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxNQUNMO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFRRCxNQUFNLE9BQ0w7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFjRCxNQUFNLGNBQ0w7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQWlGRCxNQUFNLFlBQXlEO0FBQUEsRUFDOUQ7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFBRztBQUFBLElBQ0YsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsSUFDTCxLQUFLO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxJQUNMLEtBQUs7QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLElBQ0wsS0FBSztBQUFBLEVBQ047QUFDRDtBQUVBLE1BQU0sV0FDTDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBU0QsTUFBTSx3QkFBd0IsTUFBTTtBQUNuQywwQ0FBd0M7QUFDeEMsT0FBSyxjQUFjLFdBQVk7QUFDOUIsVUFBTSxTQUFTLFdBQVcsV0FBVztBQUNyQyxXQUFPLFlBQVksT0FBTyxLQUFLLE1BQU0sRUFBRSxRQUFRLEVBQUU7QUFFakQsV0FBTyxlQUFlLE9BQU8sS0FBSyxNQUFNLEVBQUUsS0FBSyxTQUFPLE9BQU8sR0FBRyxFQUFFLFFBQVEsSUFBSSxHQUFHLE1BQVM7QUFBQSxFQUMzRixDQUFDO0FBRUQsT0FBSyx1QkFBdUIsV0FBWTtBQUN2QyxVQUFNLFNBQVMsb0JBQW9CLEdBQUc7QUFDdEMsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxHQUFHO0FBQUEsTUFDakMsSUFBSTtBQUFBLE1BQ0osSUFBSTtBQUFBLE1BQ0osSUFBSTtBQUFBLE1BQ0osSUFBSTtBQUFBLE1BQ0osSUFBSTtBQUFBLE1BQ0osSUFBSTtBQUFBLE1BQ0osSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLE1BQ2IsVUFBVTtBQUFBLE1BQ1YsSUFBSTtBQUFBLE1BQ0osSUFBSTtBQUFBLE1BQ0osU0FBUztBQUFBLE1BQ1QsSUFBSTtBQUFBLE1BQ0osVUFBVTtBQUFBLE1BQ1YsS0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0JBQXNCLFdBQVk7QUFDdEMsVUFBTSxTQUFTLG1CQUFtQixLQUFLLElBQUk7QUFFM0MsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sZUFBZSxPQUFPLEtBQUssV0FBUyxNQUFNLFNBQVMsSUFBSSxHQUFHLE1BQVM7QUFBQSxFQUMzRSxDQUFDO0FBRUQsT0FBSyxvQkFBb0IsV0FBWTtBQUNwQyxVQUFNLGdCQUFnQixpQkFBaUIsUUFBUTtBQUMvQyxXQUFPLFlBQVksY0FBYyxRQUFRLENBQUM7QUFDMUMsVUFBTSxTQUFTLGlCQUFpQixDQUFDLEVBQUUsUUFBUSxLQUFNLElBQUksYUFBYSxNQUFNLElBQUssQ0FBQyxHQUFHLFVBQVUsb0JBQUksSUFBSSxDQUFDO0FBQ3BHLFdBQU8sWUFBWSxPQUFPLE1BQU0sQ0FBQztBQUNqQyxXQUFPLFlBQVksT0FBTyxJQUFJLEdBQUksR0FBRyxLQUFLLEdBQUc7QUFBQSxFQUM5QyxDQUFDO0FBRUQsT0FBSyxhQUFhLGlCQUFrQjtBQUNuQyxVQUFNLFNBQVMsTUFBTSxVQUFVLG1CQUFtQixLQUFLLElBQUksR0FBRyxXQUFXLFdBQVcsR0FBRyxTQUFTO0FBQ2hHLFdBQU8sWUFBWSxPQUFPLFFBQVEsQ0FBQztBQUNuQyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxTQUFTO0FBQzVDLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLElBQUk7QUFDdkMsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsYUFBYTtBQUFBLEVBQ25ELENBQUM7QUFFRCxPQUFLLGtCQUFrQixXQUFZO0FBQ2xDLFdBQU8sWUFBWSxlQUFlLGtDQUFrQyxHQUFHLGlCQUFpQjtBQUN4RixXQUFPLFlBQVksZUFBZSxrQ0FBa0MsR0FBRyx5QkFBeUI7QUFBQSxFQUNqRyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
