/*---------------------------------------------------------------------------------------------
 *  ARKlight — shared arklight:// URI <-> backend-relative-path helpers
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

/** Root path inside the arklight:// scheme that maps to WORKSPACE_ROOT on the backend. */
export const SCHEME = 'arklight';
export const ROOT_PATH = '/project';

export function toRelativePath(uri: vscode.Uri): string {
	let p = uri.path;
	if (p === ROOT_PATH) {
		return '';
	}
	if (p.startsWith(ROOT_PATH + '/')) {
		p = p.slice(ROOT_PATH.length + 1);
	} else if (p.startsWith('/')) {
		p = p.slice(1);
	}
	return p;
}

export function toUri(relativePath: string): vscode.Uri {
	const normalized = relativePath.split('/').filter(Boolean).join('/');
	return vscode.Uri.from({
		scheme: SCHEME,
		path: normalized ? `${ROOT_PATH}/${normalized}` : ROOT_PATH,
	});
}
