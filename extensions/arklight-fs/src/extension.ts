/*---------------------------------------------------------------------------------------------
 *  ARKlight — arklight-fs extension entry point
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import { ArklightFileSystemProvider } from './arklightFileSystemProvider';

const SCHEME = 'arklight';

function getBackendUrl(): string {
	return vscode.workspace.getConfiguration('arklight').get<string>('backendUrl', 'http://localhost:5000');
}

export function activate(context: vscode.ExtensionContext): void {
	const provider = new ArklightFileSystemProvider(getBackendUrl());

	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider(SCHEME, provider, {
			isCaseSensitive: true,
			isReadonly: false,
		})
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('arklight.backendUrl')) {
				provider.updateBackendUrl(getBackendUrl());
			}
		})
	);
}

export function deactivate(): void { }
