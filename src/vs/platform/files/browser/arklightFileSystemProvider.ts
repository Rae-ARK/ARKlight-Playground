/*---------------------------------------------------------------------------------------------
 *  ARKlight — original addition, not part of upstream Code - OSS.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import {
	FileSystemProviderCapabilities,
	FileSystemProviderErrorCode,
	FileType,
	IFileChange,
	IFileDeleteOptions,
	IFileOverwriteOptions,
	IFileSystemProviderWithFileFolderCopyCapability,
	IFileSystemProviderWithFileReadWriteCapability,
	IFileWriteOptions,
	IStat,
	IWatchOptions,
	createFileSystemProviderError
} from '../common/files.js';

/**
 * Talks to the ARKlight backend (see /backend/app.py) over plain HTTP to
 * provide a real, on-disk workspace to the browser workbench. Registered
 * against the `arklight` URI scheme — resources look like
 * `arklight:/some/relative/path`.
 *
 * Deliberately thin: one HTTP call per filesystem operation, no local
 * caching, no live change notifications yet (`watch()` is a no-op). Good
 * enough to prove the wiring works end to end; a websocket- or
 * polling-based watch implementation can replace the no-op later without
 * changing this class's public shape.
 */
export class ArklightFileSystemProvider extends Disposable implements
	IFileSystemProviderWithFileReadWriteCapability,
	IFileSystemProviderWithFileFolderCopyCapability {

	private readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	readonly capabilities: FileSystemProviderCapabilities =
		FileSystemProviderCapabilities.FileReadWrite |
		FileSystemProviderCapabilities.FileFolderCopy |
		FileSystemProviderCapabilities.PathCaseSensitive;

	/**
	 * @param baseUrl Origin the ARKlight backend is served from, e.g.
	 *                `http://localhost:5000`. No trailing slash.
	 */
	constructor(private readonly baseUrl: string) {
		super();
	}

	// --- path helpers -----------------------------------------------------

	private toRelativePath(resource: URI): string {
		// arklight:/foo/bar.txt -> "foo/bar.txt"; arklight:/ -> ""
		const path = resource.path.replace(/^\/+/, '');
		return path;
	}

	private fileUrl(resource: URI): string {
		return `${this.baseUrl}/workspace/file/${this.toRelativePath(resource)}`;
	}

	private dirUrl(resource: URI): string {
		const rel = this.toRelativePath(resource);
		return rel.length > 0 ? `${this.baseUrl}/workspace/dir/${rel}` : `${this.baseUrl}/workspace/dir`;
	}

	private statUrl(resource: URI): string {
		return `${this.baseUrl}/workspace/stat/${this.toRelativePath(resource)}`;
	}

	// --- request helper -----------------------------------------------------

	private async request(input: string, init?: RequestInit): Promise<Response> {
		let response: Response;
		try {
			response = await fetch(input, init);
		} catch (err) {
			throw createFileSystemProviderError(
				`ARKlight backend unreachable: ${String(err)}`,
				FileSystemProviderErrorCode.Unavailable
			);
		}
		if (!response.ok) {
			throw createFileSystemProviderError(
				`ARKlight backend request failed (${response.status}): ${input}`,
				this.mapStatusToErrorCode(response.status)
			);
		}
		return response;
	}

	private mapStatusToErrorCode(status: number): FileSystemProviderErrorCode {
		switch (status) {
			case 404: return FileSystemProviderErrorCode.FileNotFound;
			case 409: return FileSystemProviderErrorCode.FileExists;
			case 403: return FileSystemProviderErrorCode.NoPermissions;
			case 413: return FileSystemProviderErrorCode.FileTooLarge;
			default: return FileSystemProviderErrorCode.Unknown;
		}
	}

	// --- IFileSystemProvider -----------------------------------------------------

	watch(_resource: URI, _opts: IWatchOptions): IDisposable {
		// No live change notifications yet. The backend has no push
		// mechanism (websocket/SSE) — see backend/README.md "Next steps".
		// Returning a no-op disposable means the workbench won't see
		// external edits until it next explicitly re-reads a resource.
		return toDisposable(() => { /* nothing to tear down */ });
	}

	async stat(resource: URI): Promise<IStat> {
		const response = await this.request(this.statUrl(resource));
		const body = await response.json() as { type: 'file' | 'directory'; size: number; mtime: number; ctime: number };
		return {
			type: body.type === 'directory' ? FileType.Directory : FileType.File,
			mtime: Math.round(body.mtime * 1000),
			ctime: Math.round(body.ctime * 1000),
			size: body.size
		};
	}

	async mkdir(resource: URI): Promise<void> {
		await this.request(this.dirUrl(resource), { method: 'POST' });
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const response = await this.request(this.dirUrl(resource));
		const entries = await response.json() as { path: string; type: 'file' | 'directory' }[];
		return entries.map(entry => {
			// backend returns paths relative to the workspace root; readdir
			// wants just the child's own name, not the full relative path
			const name = entry.path.split('/').pop() ?? entry.path;
			return [name, entry.type === 'directory' ? FileType.Directory : FileType.File] as [string, FileType];
		});
	}

	async delete(resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		await this.request(this.fileUrl(resource), { method: 'DELETE' });
	}

	async rename(from: URI, to: URI, opts: IFileOverwriteOptions): Promise<void> {
		if (!opts.overwrite) {
			// backend already refuses to overwrite by default (409 on an
			// existing destination), so the non-overwrite case needs no
			// extra check here — just let a 409 propagate as FileExists.
		}
		await this.request(this.fileUrl(from), {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newPath: this.toRelativePath(to) })
		});
	}

	async copy(from: URI, to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		await this.request(`${this.baseUrl}/workspace/copy`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ from: this.toRelativePath(from), to: this.toRelativePath(to) })
		});
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const response = await this.request(this.fileUrl(resource));
		const buffer = await response.arrayBuffer();
		return new Uint8Array(buffer);
	}

	async writeFile(resource: URI, content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		await this.request(this.fileUrl(resource), {
			method: 'PUT',
			headers: { 'Content-Type': 'application/octet-stream' },
			body: new Blob([content as unknown as BlobPart])
		});
	}
}
