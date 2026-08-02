/*---------------------------------------------------------------------------------------------
 *  ARKlight — file/text search providers backed by backend/app.py
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { toUri } from './arklightPaths';

interface BackendFileEntry {
	path: string;
	type: 'file' | 'directory';
}

interface BackendSearchMatch {
	path: string;
	line: number;
	column: number;
	text: string;
}

interface BackendSearchResponse {
	query: string;
	matches: BackendSearchMatch[];
	truncated: boolean;
}

/** Loose subsequence match: every character of `needle` appears in `haystack`, in order. */
function fuzzyContains(haystack: string, needle: string): boolean {
	let i = 0;
	for (let j = 0; j < haystack.length && i < needle.length; j++) {
		if (haystack[j] === needle[i]) {
			i++;
		}
	}
	return i === needle.length;
}

export class ArklightSearchProvider implements vscode.FileSearchProvider2, vscode.TextSearchProvider2 {

	constructor(private backendUrl: string) { }

	updateBackendUrl(backendUrl: string): void {
		this.backendUrl = backendUrl;
	}

	private base(): string {
		return this.backendUrl.replace(/\/+$/, '');
	}

	async provideFileSearchResults(pattern: string, options: vscode.FileSearchProviderOptions, token: vscode.CancellationToken): Promise<vscode.Uri[]> {
		const response = await fetch(`${this.base()}/workspace/files`);
		if (!response.ok) {
			return [];
		}
		const entries = await response.json() as BackendFileEntry[];
		const needle = pattern.toLowerCase();

		const results: vscode.Uri[] = [];
		for (const entry of entries) {
			if (token.isCancellationRequested) {
				break;
			}
			if (entry.type !== 'file') {
				continue;
			}
			if (needle === '' || fuzzyContains(entry.path.toLowerCase(), needle)) {
				results.push(toUri(entry.path));
				if (results.length >= options.maxResults) {
					break;
				}
			}
		}
		return results;
	}

	async provideTextSearchResults(
		query: vscode.TextSearchQuery2,
		options: vscode.TextSearchProviderOptions,
		progress: vscode.Progress<vscode.TextSearchResult2>,
		token: vscode.CancellationToken
	): Promise<vscode.TextSearchComplete2> {
		if (!query.pattern) {
			return { limitHit: false };
		}

		const response = await fetch(`${this.base()}/workspace/search?q=${encodeURIComponent(query.pattern)}`);
		if (!response.ok) {
			return { limitHit: false };
		}
		const body = await response.json() as BackendSearchResponse;

		let reported = 0;
		for (const match of body.matches) {
			if (token.isCancellationRequested || reported >= options.maxResults) {
				break;
			}
			const uri = toUri(match.path);
			const line = Math.max(0, match.line - 1);
			const startCol = Math.max(0, match.column);
			const endCol = startCol + query.pattern.length;
			const range = new vscode.Range(line, startCol, line, endCol);

			progress.report(new vscode.TextSearchMatch2(uri, [{ sourceRange: range, previewRange: range }], match.text));
			reported++;
		}

		return { limitHit: body.truncated || reported >= options.maxResults };
	}
}
