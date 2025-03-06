import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

// Clase to manage tree file explorer
class FileCounterProvider implements vscode.TreeDataProvider<FileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    FileItem | undefined | void
  > = new vscode.EventEmitter<FileItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<FileItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private originalItems: FileItem[] = [];
  private filteredItems: FileItem[] = [];
  private filterText: string = "";
  private filterExtensions: string[] = [];
  private filterType: "extensions" | "name" | "none" = "none";
  private filterValue: string = "";

  constructor() {
    const config = vscode.workspace.getConfiguration("tree_folder_file_counter");
    this.filterText = config.get("search", "");
    this.parseFilter(this.filterText);
    this.loadInitialItems();
  }

  private parseFilter(filterText: string) {
    this.filterText = filterText.toLowerCase();
    if (!this.filterText) {
      this.filterType = "none";
      this.filterExtensions = [];
      this.filterValue = "";
    } else if (this.filterText.startsWith("*.")) {
      this.filterType = "extensions";
      this.filterExtensions = this.filterText
        .split("|")
        .map((ext) => ext.replace("*.", "").trim());
      this.filterValue = "";
    } else {
      this.filterType = "name";
      this.filterValue = this.filterText;
    }
  }

  private loadInitialItems() {
    if (!vscode.workspace.workspaceFolders) {
      this.originalItems = [];
      this.filteredItems = [];
      return;
    }
    const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    this.originalItems = this.getFilesAndFolders(rootPath, true);
    this.applyFilter(this.filterText);
  }

  refresh(): void {
    this.loadInitialItems();
    this._onDidChangeTreeData.fire();
  }

  applyFilter(filterText: string): void {
    this.parseFilter(filterText);
    if (this.filterType === "none") {
      this.filteredItems = [...this.originalItems];
    } else if (this.filterType === "extensions") {
      this.filteredItems = this.filterByExtensions(this.originalItems);
    } else {
      this.filteredItems = this.filterByName(this.originalItems);
    }
    this._onDidChangeTreeData.fire();
  }

  private filterByExtensions(items: FileItem[]): FileItem[] {
    const filtered: FileItem[] = [];
    for (const item of items) {
      if (item.type === "file") {
        const ext = path.extname(item.label).toLowerCase().replace(".", "");
        if (this.filterExtensions.includes(ext)) {
          filtered.push(item);
        }
      } else if (item.type === "folder") {
        const children = this.getFilesAndFolders(item.filePath, false);
        const filteredChildren = this.filterByExtensions(children);
        if (filteredChildren.length > 0) {
          const fileCount = this.countFilesByExtensions(item.filePath);
          const folderItem = new FileItem(
            `${item.label.split(" (")[0]} (${fileCount} archivos)`,
            vscode.TreeItemCollapsibleState.Collapsed,
            item.filePath,
            "folder"
          );
          filtered.push(folderItem);
        }
      }
    }
    return filtered;
  }

  private filterByName(items: FileItem[]): FileItem[] {
    const filtered: FileItem[] = [];
    for (const item of items) {
      if (item.label.toLowerCase().includes(this.filterValue)) {
        filtered.push(item);
      } else if (item.type === "folder") {
        const children = this.getFilesAndFolders(item.filePath, false);
        const filteredChildren = this.filterByName(children);
        if (filteredChildren.length > 0) {
          const fileCount = this.countFilesByName(item.filePath);
          const folderItem = new FileItem(
            `${item.label.split(" (")[0]} (${fileCount} archivos)`,
            vscode.TreeItemCollapsibleState.Collapsed,
            item.filePath,
            "folder"
          );
          filtered.push(folderItem);
        }
      }
    }
    return filtered;
  }

  updateSearchFilter(filterText: string): void {
    this.filterText = filterText;
    const config = vscode.workspace.getConfiguration("tree_folder_file_counter");
    config.update("search", filterText, vscode.ConfigurationTarget.Global);
    this.applyFilter(filterText);
  }

  getTreeItem(element: FileItem): vscode.TreeItem {
	const  defaultEmoji:string = `⭐`;
	const customEmoji:string =  vscode.workspace.getConfiguration("tree_folder_file_counter") .get("customMatchEmoji") || '';

    if (element.type === "file") {
      const ext = path.extname(element.label).toLowerCase().replace(".", "");
      const isMatch =
        (this.filterType === "extensions" &&
          this.filterExtensions.includes(ext)) ||
        (this.filterType === "name" &&
          element.label.toLowerCase().includes(this.filterValue));

      if (isMatch) {
        // Highlight files that match the filter
		element.iconPath = new vscode.ThemeIcon("file");

		if (vscode.workspace .getConfiguration("tree_folder_file_counter").get("showMatchArrow"))  {
			element.iconPath = new vscode.ThemeIcon("arrow-right");  // Add differente icon to highlight
		}

		if (vscode.workspace.getConfiguration("tree_folder_file_counter") .get("showMatchEmoji"))  {
			element.label = ` ${customEmoji||defaultEmoji} ${element.label}`;  // Add an emoji to highlight the file
		  }

      } else {
        element.iconPath = new vscode.ThemeIcon("file");
      }


    } else if (element.type === "folder") {
      element.iconPath = new vscode.ThemeIcon("folder");
    } else if (element.type === "clearItem") {
      element.iconPath = new vscode.ThemeIcon("clear-all");
    }
    return element;
  }

  getChildren(element?: FileItem): Thenable<FileItem[]> {
    if (!vscode.workspace.workspaceFolders) {
      return Promise.resolve([]);
    }

    if (!element) {
      const searchItem = new FileItem(
        "Search...",
        vscode.TreeItemCollapsibleState.None,
        ""
      );
      searchItem.command = {
        command: "tree-folder-file-counter.search",
        title: "Search folders and files",
      };
      searchItem.iconPath = new vscode.ThemeIcon("search");
      searchItem.contextValue = "searchItem";

      const clearItem = new FileItem(
        "Clean filter",
        vscode.TreeItemCollapsibleState.None,
        ""
      );
      clearItem.command = {
        command: "tree-folder-file-counter.clearFilter",
        title: "Clean filter",
      };
      clearItem.iconPath = new vscode.ThemeIcon("clear-all");
      clearItem.contextValue = "clearItem";

      return Promise.resolve([searchItem, clearItem, ...this.filteredItems]);
    } else {
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
        let fileCount: number;
        if (this.filterType === "extensions") {
          fileCount = this.countFilesByExtensions(filePath);
        } else if (this.filterType === "name") {
          fileCount = this.countFilesByName(filePath);
        } else {
          fileCount = this.countFiles(filePath);
        }

        const collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;

        const folderItem = new FileItem(
          `${file} (${fileCount} archivos)`,
          collapsibleState,
          filePath,
          "folder"
        );
        items.push(folderItem);
      } else if (stat.isFile()) {
        const fileItem = new FileItem(
          file,
          vscode.TreeItemCollapsibleState.None,
          filePath,
          "file",
        );
		fileItem.command = {
			command: 'vscode.open',
			title:'Open file',
			arguments: [vscode.Uri.file(filePath)]
		};
        items.push(fileItem);
      }
    }
    return items;
  }

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

  private countFilesByExtensions(folderPath: string): number {
    let count = 0;
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const ext = path.extname(file).toLowerCase().replace(".", "");
        if (this.filterExtensions.includes(ext)) {
          count++;
        }
      } else if (stat.isDirectory()) {
        count += this.countFilesByExtensions(filePath);
      }
    }
    return count;
  }

  private countFilesByName(folderPath: string): number {
    let count = 0;
    const files = fs.readdirSync(folderPath);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        if (file.toLowerCase() === this.filterValue) {
          count++;
        }
      } else if (stat.isDirectory()) {
        count += this.countFilesByName(filePath);
      }
    }
    return count;
  }
}

class FileItem extends vscode.TreeItem {
  constructor(
    public label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly filePath: string,
    public readonly type: "folder" | "file" | "searchItem" | "clearItem" = "searchItem",
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label}`;
    this.contextValue = type;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "tree-folder-file-counter" is now active!'
  );

  const fileCounterProvider = new FileCounterProvider();
  vscode.window.registerTreeDataProvider(
    "fileCounterView",
    fileCounterProvider
  );

  let searchCommand = vscode.commands.registerCommand(
    "tree-folder-file-counter.search",
    async () => {
      const inputBox = vscode.window.createInputBox();
      inputBox.placeholder = "Count files (ej: *.json|*.yaml)...";
      inputBox.value = fileCounterProvider["filterText"] || "";
      inputBox.onDidChangeValue((value) => {
        fileCounterProvider.updateSearchFilter(value);
      });
      inputBox.onDidAccept(() => {
        inputBox.hide();
      });
      inputBox.show();
    }
  );

  let clearFilterCommand = vscode.commands.registerCommand(
    "tree-folder-file-counter.clearFilter",
    () => {
      fileCounterProvider.updateSearchFilter("");
    }
  );

  let refreshCommand = vscode.commands.registerCommand(
    "tree-folder-file-counter.refresh",
    () => {
      fileCounterProvider.refresh();
    }
  );

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("tree_folder_file_counter.search")) {
      const config = vscode.workspace.getConfiguration("tree_folder_file_counter");
      const newFilter = config.get("search", "");
      fileCounterProvider.applyFilter(newFilter);
    }
  });

  const watcher = vscode.workspace.createFileSystemWatcher("**/*");

  watcher.onDidCreate((uri) => {
    if (
      !vscode.workspace
        .getConfiguration("tree_folder_file_counter")
        .get("showNotifications")
    ) {
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

  watcher.onDidDelete((uri) => {
    if (
      !vscode.workspace
        .getConfiguration("tree_folder_file_counter")
        .get("showNotifications")
    ) {
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
  context.subscriptions.push(searchCommand);
  context.subscriptions.push(clearFilterCommand);
}

export function deactivate() {}