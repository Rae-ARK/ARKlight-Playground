/*---------------------------------------------------------------------------------------------
 *  ARKlight — FileSystemProvider backed by backend/app.py
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

/** Root path inside the arklight:// scheme that maps to WORKSPACE_ROOT on the backend. */
const ROOT_PATH = '/project';

interface BackendStatEntry {
	path: string;
	type: 'file' | 'directory';
	size: number;
	mtime: number; // seconds since epoch, float
	ctime: number; // seconds since epoch, float
}

function toRelativePath(uri: vscode.Uri): string {
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

function toFileType(entry: Pick<BackendStatEntry, 'type'>): vscode.FileType {
	return entry.type === 'directory' ? vscode.FileType.Directory : vscode.FileType.File;
}

async function parseErrorBody(response: Response): Promise<string> {
	try {
		const body = await response.json() as { message?: string; error?: string };
		return body.message ?? body.error ?? response.statusText;
	} catch {
		return response.statusText;
	}
}

function toFileSystemError(uri: vscode.Uri, status: number, message: string): vscode.FileSystemError {
	switch (status) {
		case 404:
			return vscode.FileSystemError.FileNotFound(uri);
		case 409:
			return vscode.FileSystemError.FileExists(uri);
		case 403:
			return vscode.FileSystemError.NoPermissions(uri);
		default:
			return vscode.FileSystemError.Unavailable(message || uri.toString());
	}
}

export class ArklightFileSystemProvider implements vscode.FileSystemProvider {

	private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile = this._onDidChangeFile.event;

	constructor(private backendUrl: string) { }

	updateBackendUrl(backendUrl: string): void {
		this.backendUrl = backendUrl;
	}

	private endpoint(relativePath: string, kind: 'file' | 'dir' | 'stat'): string {
		const base = this.backendUrl.replace(/\/+$/, '');
		const encoded = relativePath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
		return `${base}/workspace/${kind}/${encoded}`;
	}

	private async request(input: string, init?: RequestInit): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(input, init);
		} catch (err) {
			throw vscode.FileSystemError.Unavailable(`ARKlight backend unreachable at ${this.backendUrl}: ${(err as Error).message}`);
		}
		return response;
	}

	// -- watch -------------------------------------------------------------
	// No live change notifications yet (see backend/README.md "Next steps");
	// clients that call watch() get a no-op subscription for now.
	watch(_uri: vscode.Uri, _options: { readonly recursive: boolean; readonly excludes: readonly string[] }): vscode.Disposable {
		return new vscode.Disposable(() => { });
	}

	// -- stat ----------------------------------------------------------------
	async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
		const rel = toRelativePath(uri);
		if (rel === '') {
			// The workspace root itself always resolves; the backend creates
			// WORKSPACE_ROOT on startup if it doesn't already exist.
			return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
		}

		const response = await this.request(this.endpoint(rel, 'stat'));
		if (!response.ok) {
			throw toFileSystemError(uri, response.status, await parseErrorBody(response));
		}
		const entry = await response.json() as BackendStatEntry;
		return {
			type: toFileType(entry),
			ctime: Math.round(entry.ctime * 1000),
			mtime: Math.round(entry.mtime * 1000),
			size: entry.size,
		};
	}

	// -- directories -----------------------------------------------------------
	async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
		const rel = toRelativePath(uri);
		const response = await this.request(this.endpoint(rel, 'dir'));
		if (!response.ok) {
			throw toFileSystemError(uri, response.status, await parseErrorBody(response));
		}
		const entries = await response.json() as BackendStatEntry[];
		return entries.map(entry => {
			const name = entry.path.split('/').pop()!;
			return [name, toFileType(entry)] as [string, vscode.FileType];
		});
	}

	async createDirectory(uri: vscode.Uri): Promise<void> {
		const rel = toRelativePath(uri);
		const response = await this.request(this.endpoint(rel, 'dir'), { method: 'POST' });
		if (!response.ok && response.status !== 409) {
			throw toFileSystemError(uri, response.status, await parseErrorBody(response));
		}
		this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Created, uri }]);
	}

	// -- files -------------------------------------------------------------
	async readFile(uri: vscode.Uri): Promise<Uint8Array> {
		const rel = toRelativePath(uri);
		const response = await this.request(this.endpoint(rel, 'file'));
		if (!response.ok) {
			throw toFileSystemError(uri, response.status, await parseErrorBody(response));
		}
		const buffer = await response.arrayBuffer();
		return new Uint8Array(buffer);
	}

	async writeFile(uri: vscode.Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean }): Promise<void> {
		const rel = toRelativePath(uri);

		let existed = true;
		try {
			await this.stat(uri);
		} catch {
			existed = false;
		}

		if (!existed && !options.create) {
			throw vscode.FileSystemError.FileNotFound(uri);
		}
		if (existed && !options.overwrite) {
			throw vscode.FileSystemError.FileExists(uri);
		}

		const response = await this.request(this.endpoint(rel, 'file'), {
			method: 'PUT',
			body: content,
		});
		if (!response.ok) {
			throw toFileSystemError(uri, response.status, await parseErrorBody(response));
		}

		this._onDidChangeFile.fire([{ type: existed ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created, uri }]);
	}

	async delete(uri: vscode.Uri, _options: { readonly recursive: boolean }): Promise<void> {
		const rel = toRelativePath(uri);
		const response = await this.request(this.endpoint(rel, 'file'), { method: 'DELETE' });
		if (!response.ok) {
			throw toFileSystemError(uri, response.status, await parseErrorBody(response));
		}
		this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
	}

	async rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { readonly overwrite: boolean }): Promise<void> {
		const oldRel = toRelativePath(oldUri);
		const newRel = toRelativePath(newUri);

		if (!options.overwrite) {
			try {
				await this.stat(newUri);
				throw vscode.FileSystemError.FileExists(newUri);
			} catch (err) {
				if (err instanceof vscode.FileSystemError && err.code !== 'FileNotFound') {
					throw err;
				}
			}
		}

		const response = await this.request(this.endpoint(oldRel, 'file'), {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newPath: newRel }),
		});
		if (!response.ok) {
			throw toFileSystemError(oldUri, response.status, await parseErrorBody(response));
		}

		this._onDidChangeFile.fire([
			{ type: vscode.FileChangeType.Deleted, uri: oldUri },
			{ type: vscode.FileChangeType.Created, uri: newUri },
		]);
	}

	async copy(source: vscode.Uri, destination: vscode.Uri, options: { readonly overwrite: boolean }): Promise<void> {
		const from = toRelativePath(source);
		const to = toRelativePath(destination);

		if (!options.overwrite) {
			try {
				await this.stat(destination);
				throw vscode.FileSystemError.FileExists(destination);
			} catch (err) {
				if (err instanceof vscode.FileSystemError && err.code !== 'FileNotFound') {
					throw err;
				}
			}
		}

		const base = this.backendUrl.replace(/\/+$/, '');
		const response = await this.request(`${base}/workspace/copy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ from, to }),
		});
		if (!response.ok) {
			throw toFileSystemError(destination, response.status, await parseErrorBody(response));
		}

		this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Created, uri: destination }]);
	}
}
