// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from "fs";
import * as path from "path";

// Clase to manage tree file explorer
class FileCounterProvider implements vscode.TreeDataProvider<FileItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<FileItem | undefined | void> = new vscode.EventEmitter<FileItem | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | void> = this._onDidChangeTreeData.event;
  
	constructor() {}  
  
	refresh(): void {
	  this._onDidChangeTreeData.fire();
	}
  
	getTreeItem(element: FileItem): vscode.TreeItem {
	  return element;
	}
  
	getChildren(element?: FileItem): Thenable<FileItem[]> {
		if (!vscode.workspace.workspaceFolders) {
			return Promise.resolve([]);
		}
	
		// If there is no element, we are in the workspace's root
		const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
		
		if (!element) {
			// Load only first level directories
			return Promise.resolve(this.getFilesAndFolders(rootPath, true));
		} else {
			// Only load subdirectories once, without loading the same levels each time
			return Promise.resolve(this.getFilesAndFolders(element.filePath, false));
		}
	}
      
	private getFilesAndFolders(folderPath: string, isRoot: boolean): FileItem[] {
		let items: FileItem[] = [];
		const files = fs.readdirSync(folderPath);
	
		for (const file of files) {
			const filePath = path.join(folderPath, file);
			const stat = fs.statSync(filePath);
	
			if (stat.isDirectory()) {
				const fileCount = this.countFiles(filePath);
	
				// 📌 Check if there are subfolders
				const hasSubfolders = fs.readdirSync(filePath).some(subfile => 
					fs.statSync(path.join(filePath, subfile)).isDirectory()
				);
	
				// ✅ Check if there are subfolders.
				// Collapse only if there are subfolders
				const collapsibleState = hasSubfolders ? 
					vscode.TreeItemCollapsibleState.Collapsed : 
					vscode.TreeItemCollapsibleState.None;
	
				const folderItem = new FileItem(`${file} (${fileCount} archivos)`, collapsibleState, filePath);
				items.push(folderItem);
			}
		}
		return items;
	}
  
	// Count files
	private countFiles(folderPath: string): number {
	  let count = 0;
	  const files = fs.readdirSync(folderPath);
  
	  for (const file of files) {
		const filePath = path.join(folderPath, file);
		const stat = fs.statSync(filePath);
		if (stat.isFile()) {
		  count++;
		} else if (stat.isDirectory()) {
		  count += this.countFiles(filePath);
		}
	  }
	  return count;
	}
  }

  // Class to represent folders
class FileItem extends vscode.TreeItem {
	constructor(
	  public readonly label: string,
	  public readonly collapsibleState: vscode.TreeItemCollapsibleState,
	  public readonly filePath: string
	) {
	  super(label, collapsibleState);
	  this.tooltip = `${this.label}`;
	  this.contextValue = "file";
}
}
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "tree-folder-file-counter" is now active!');

	const fileCounterProvider = new FileCounterProvider();
	 vscode.window.registerTreeDataProvider("fileCounterView", fileCounterProvider);

	  // Command to refresh manually
	  let refreshCommand = vscode.commands.registerCommand("tree-folder-file-counter.refresh", () => {
        fileCounterProvider.refresh();
    });

	// 📌 Real time monitoring
    const watcher = vscode.workspace.createFileSystemWatcher("**/*");
	
	// Show notification when a new file or folder is created
	watcher.onDidCreate(uri => {
		if (!vscode.workspace.getConfiguration("tree_folder_file_counter").get("showNotifications")) {
            fileCounterProvider.refresh();
            return;
        }

        const fileName = path.basename(uri.fsPath);
        let message;

        try {
            const isDirectory = fs.statSync(uri.fsPath).isDirectory();
            message = isDirectory
                ? `📂 New folder: ${fileName}`
                : `📄 New file: ${fileName}`;
        } catch (error) {
            message = `📦 New element: ${fileName}`;
        }

        vscode.window.showInformationMessage(message);
        fileCounterProvider.refresh();
    });

	// Show notification when a file or folder is deleted
    watcher.onDidDelete(uri => {
		if (!vscode.workspace.getConfiguration("tree_folder_file_counter").get("showNotifications")) {
            fileCounterProvider.refresh();
            return;
        }
		
        const fileName = path.basename(uri.fsPath);
        let message;

        try {
            const isDirectory = fs.statSync(uri.fsPath).isDirectory();
            message = isDirectory
                ? `🗂 Folder deleted: ${fileName}`
                : `📝 File deleted: ${fileName}`;
        } catch (error) {
            message = `🗑 Element deleted: ${fileName}`;
        }

        vscode.window.showWarningMessage(message);
        fileCounterProvider.refresh();
    });

    watcher.onDidCreate(() => fileCounterProvider.refresh());
    watcher.onDidDelete(() => fileCounterProvider.refresh());
    watcher.onDidChange(() => fileCounterProvider.refresh());

    context.subscriptions.push(watcher);
	context.subscriptions.push(refreshCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
