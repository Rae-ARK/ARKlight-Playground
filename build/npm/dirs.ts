/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync } from 'fs';

/**
 * Complete list of directories where npm should be executed to install node modules
 *
 * ARKlight note: trimmed down from the stock Code - OSS list to match what
 * actually survives PRUNE-PLAN.md's batches -- the stock list still had ~40
 * entries (extensions/git, extensions/copilot, test/*, .vscode/extensions/*,
 * etc.) pointing at directories that no longer exist in this fork, which made
 * every `npm install` fail with a wall of "spawn /bin/sh ENOENT" once the
 * parallel install sweep reached them.
 */
export const dirs = [
	'',
	'build',
	'build/rspack',
	'build/vite',
	'extensions',
	'extensions/arklight-fs',
	'extensions/css',
	'extensions/html',
	'extensions/javascript',
	'extensions/json',
	'extensions/markdown-basics',
	'extensions/media-preview',
	'extensions/merge-conflict',
	'extensions/pug',
	'extensions/python',
	'extensions/references-view',
	'extensions/search-result',
	'extensions/simple-browser',
	'extensions/theme-defaults',
	'remote',
	'remote/web',
];

if (existsSync(`${import.meta.dirname}/../../.build/distro/npm`)) {
	dirs.push('.build/distro/npm');
	dirs.push('.build/distro/npm/remote');
	dirs.push('.build/distro/npm/remote/web');
}
