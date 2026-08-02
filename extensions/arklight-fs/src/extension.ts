/*---------------------------------------------------------------------------------------------
 *  ARKlight — arklight-fs extension entry point
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ArklightFileSystemProvider } from './arklightFileSystemProvider';
import { ArklightSearchProvider } from './arklightSearchProvider';
import { SCHEME } from './arklightPaths';

function getBackendUrl(): string {
	return vscode.workspace.getConfiguration('arklight').get<string>('backendUrl', 'http://localhost:5000');
}

export function activate(context: vscode.ExtensionContext): void {
	const fileSystemProvider = new ArklightFileSystemProvider(getBackendUrl());
	const searchProvider = new ArklightSearchProvider(getBackendUrl());

	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider(SCHEME, fileSystemProvider, {
			isCaseSensitive: true,
			isReadonly: false,
		})
	);
	context.subscriptions.push(vscode.workspace.registerFileSearchProvider2(SCHEME, searchProvider));
	context.subscriptions.push(vscode.workspace.registerTextSearchProvider2(SCHEME, searchProvider));
	context.subscriptions.push(new vscode.Disposable(() => fileSystemProvider.dispose()));

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('arklight.backendUrl')) {
				const backendUrl = getBackendUrl();
				fileSystemProvider.updateBackendUrl(backendUrl);
				searchProvider.updateBackendUrl(backendUrl);
			}
		})
	);
}

export function deactivate(): void { }
