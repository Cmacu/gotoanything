import * as vscode from 'vscode';
import quickPickIcons from './symbolIcons';
import { TextDecoder } from 'util';

interface QuickPickAnything extends vscode.QuickPickItem {
  uri?: vscode.Uri;
  shortcut?: string;
  symbol?: string;
  range?: vscode.Range;
}
interface SymbolSearchType {
  prefix?: string;
  label: string;
  callFunction: (search: SearchItem) => Promise<QuickPickAnything[]>;
  forceSearch?: boolean;
  symbolKinds?: number[];
  detectOnlyOnFirstChar?: boolean;
  ignore?: string;
  command?: string;
}

interface SearchItem {
  name: string;
  type: SymbolSearchType;
  fileQuery: string;
  symbolQuery: string;
  forceSearch?: boolean;
}

interface SearchResult {
  success: boolean;
  items: QuickPickAnything[];
  retry?: boolean;
}

type IgnoreRecord = Record<string, boolean>;

export default class GoToAnyting {
  private originalUri: vscode.Uri | undefined;
  private currentType: string = '';
  private currentItem: QuickPickAnything | undefined;
  private currentSymbols: { file: vscode.Uri; symbols: vscode.DocumentSymbol[] | undefined } | undefined;
  private workspaceFolder: string;
  private enablePreview: boolean;
  private previewDelay: number;
  private files: QuickPickAnything[] = [];
  private searchTypes: { [name: string]: SymbolSearchType };

  public constructor() {
    const workspace = vscode.workspace.workspaceFolders![0];
    this.workspaceFolder = workspace ? workspace.uri.path : '';
    this.loadFiles(workspace.uri);
    const config = vscode.workspace.getConfiguration();
    this.searchTypes = this.getSearchTypes(config);
    this.enablePreview = config.get('workbench.editor.enablePreview', true);
    this.previewDelay = config.get('GoToAnything.previewDelay', 250);
    this.originalUri = this.getCurrentUri();
    this.createQuickPick();
  }

  private createQuickPick(): void {
    const quickPick = vscode.window.createQuickPick<QuickPickAnything>();
    quickPick.placeholder = "Go To Anything. Type '" + this.searchTypes.Help.prefix + "' for help";
    quickPick.matchOnDescription = true;
    quickPick.onDidChangeValue((value) => this.onDidChangeValue(value, quickPick));
    quickPick.onDidChangeActive((items) => this.onDidChangeActive(items, quickPick));
    quickPick.onDidHide((e) => this.onDidHide());
    quickPick.onDidAccept((e) => this.onDidAccept(e, quickPick));
    quickPick.show();
  }

  private onDidChangeValue(value: string, quickPick: vscode.QuickPick<QuickPickAnything>) {
    quickPick.busy = true;
    setTimeout(
      (value) => {
        if (quickPick.value == value) {
          return this.search(value.trim())
            .then((result: SearchResult) => {
              if (result.success) quickPick.items = result.items;
              else if (result.retry) this.onDidChangeValue(value, quickPick);
            })
            .finally(() => (quickPick.busy = false));
        }
        quickPick.busy = false;
      },
      this.previewDelay,
      value,
    );
  }

  private onDidChangeActive(items: QuickPickAnything[], quickPick: vscode.QuickPick<QuickPickAnything>) {
    if (!items || !items.length || !items[0] || !this.enablePreview) return;
    quickPick.busy = true;
    this.currentItem = items[0];
    setTimeout(
      (item) => {
        if (quickPick.activeItems && quickPick.activeItems[0].uri === item.uri) {
          return this.showItem(item, {
            preserveFocus: true,
            preview: true,
          }).then((isSelected) => (quickPick.busy = false));
        }
        quickPick.busy = false;
      },
      this.previewDelay,
      this.currentItem,
    );
  }

  private onDidAccept(e: void, quickPick: vscode.QuickPick<QuickPickAnything>) {
    this.originalUri = undefined;
    const items = quickPick.selectedItems;
    const item = items && items.length && items[0] ? items[0] : this.currentItem;
    if (!item) {
      quickPick.hide();
      return;
    }
    if (item.shortcut == undefined) {
      return this.showItem(item, { preview: false }).then(() => quickPick.hide());
    }
    const search = this.getSearchItem(item.shortcut);
    if (search.type.command) return this.runCommand(search);
    this.currentItem = undefined;
    quickPick.value = item.shortcut;
  }

  private onDidHide(): void {
    if (this.originalUri) {
      vscode.window.showTextDocument(this.originalUri, { preserveFocus: true });
    }
  }

  public async search(query: string): Promise<SearchResult> {
    const search = this.getSearchItem(query);
    if (this.currentType == search.name && !search.forceSearch) {
      return { success: false, items: [] };
    }
    return search.type.callFunction
      .call(this, search)
      .then((items) => {
        this.currentType = search.name;
        return { success: true, items: items };
      })
      .catch(() => ({ success: false, retry: true, items: [] }));
  }

  private showItem(item: QuickPickAnything, options: vscode.TextDocumentShowOptions): Thenable<boolean> {
    if (!item.uri) {
      return Promise.resolve(false);
    }
    return vscode.window.showTextDocument(item.uri, options).then((editor) => {
      this.showRange(editor, item.range, item.symbol);
      return true;
    });
  }

  private showRange(
    editor: vscode.TextEditor | undefined,
    range: vscode.Range | undefined,
    symbol: string | undefined,
  ): void {
    if (!editor || !range) {
      return;
    }
    let start = range.start;
    let end = range.end;
    if (symbol) {
      const textLine = editor.document.lineAt(range.start.line).text;
      const symbolStart = textLine.indexOf(symbol);
      if (symbolStart >= 0) {
        start = new vscode.Position(range.start.line, symbolStart);
        end = new vscode.Position(range.start.line, symbolStart + symbol.length);
      }
    }
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), 1);
  }

  private getSearchItem(query: string): SearchItem {
    let fileSearch = {
      name: 'Files',
      type: {
        callFunction: this.getFiles,
        prefix: '',
        label: 'Files',
      },
      fileQuery: query,
      symbolQuery: '',
    };
    if (!query || !query.length) {
      return fileSearch;
    }

    for (let searchName in this.searchTypes) {
      let searchType = this.searchTypes[searchName];
      if (!searchType.prefix) {
        continue;
      }
      const symbolIndex = query.indexOf(searchType.prefix);
      if (!(symbolIndex < 0)) {
        if (searchType.detectOnlyOnFirstChar && symbolIndex != 0) {
          continue;
        }
        return {
          name: searchName,
          type: searchType,
          fileQuery: query.substring(0, symbolIndex),
          symbolQuery: query.substring(symbolIndex + 1),
          forceSearch: searchType.forceSearch,
        };
      }
    }

    return fileSearch;
  }

  private async addLine(search: SearchItem): Promise<QuickPickAnything[]> {
    const file = this.getCurrentUri();
    if (!file) {
      return [];
    }
    const position = search.symbolQuery.split(':');
    let line = 0;
    if (position.length && !isNaN(+position[0])) {
      line = +position[0] - 1;
    }
    let character = 0;
    if (position.length > 1 && !isNaN(+position[1])) {
      character = +position[1] - 1;
    }
    const start = new vscode.Position(line, character);
    const end = new vscode.Position(line, character);
    let item = this.processFile(file);
    item.label += this.searchTypes.Line.prefix + search.symbolQuery;
    item.description += ' ' + search.fileQuery + this.searchTypes.Line.prefix + search.symbolQuery;
    item.range = new vscode.Range(start, end);
    return [item];
  }

  private async findSymbols(search: SearchItem): Promise<QuickPickAnything[]> {
    const file = this.getCurrentUri();
    if (file === undefined) {
      return [];
    }
    let symbols: vscode.DocumentSymbol[] | undefined;
    if (this.currentSymbols && this.currentSymbols.file == file) {
      symbols = this.currentSymbols.symbols;
    } else {
      symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        file,
      );
      this.currentSymbols = { file: file, symbols: symbols };
    }
    return this.reduceSymbols(symbols, search.type).map((symbol) =>
      this.processSymbol(symbol, search.fileQuery + search.type.prefix),
    );
  }

  private reduceSymbols(symbols: vscode.DocumentSymbol[] | undefined, kind: SymbolSearchType): vscode.DocumentSymbol[] {
    let reduced: vscode.DocumentSymbol[] = [];
    if (symbols == undefined) {
      return reduced;
    }
    symbols.forEach((symbol: vscode.DocumentSymbol) => {
      if (
        kind.symbolKinds &&
        kind.symbolKinds.includes(symbol.kind) &&
        (!kind.ignore || symbol.name.indexOf(kind.ignore) < 0)
      ) {
        reduced.push(symbol);
      }
      reduced = reduced.concat(this.reduceSymbols(symbol.children, kind));
    });
    return reduced;
  }

  private processSymbol(symbol: vscode.DocumentSymbol, query: string): QuickPickAnything {
    const information = (symbol as unknown) as vscode.SymbolInformation;
    const file = information.location.uri;
    const parrent = information.containerName.length ? information.containerName + ' in ' : '';
    const icon = quickPickIcons[symbol.kind];
    const detail = vscode.SymbolKind[symbol.kind] + parrent + ' in ' + file.path.replace(this.workspaceFolder, '');
    const label = icon + ' ' + symbol.name;
    const description = query + ' ' + symbol.name; // the space is added so searching is not limited to sybmol start
    return {
      uri: file,
      symbol: symbol.name,
      label: label,
      detail: detail,
      range: symbol.range,
      description: description,
    };
  }

  private processFile(file: vscode.Uri): QuickPickAnything {
    return {
      uri: file,
      label: '$(code) ' + file.path.split('/').pop(),
      description: file.path.replace(this.workspaceFolder, ''),
    };
  }

  private async getFiles(search: SearchItem): Promise<QuickPickAnything[]> {
    if (!this.files.length) {
      throw 'Workspace files not available';
    }
    return this.files;
  }

  private async loadFiles(workspaceUri: vscode.Uri): Promise<void> {
    const excludePattern = await this.getExcludePattern(workspaceUri);
    console.log(excludePattern);
    const files = await vscode.workspace.findFiles('**/', excludePattern);
    this.files = files.map((file) => this.processFile(file));
  }

  private async getHelp(): Promise<QuickPickAnything[]> {
    let index = 1;
    let items: QuickPickAnything[] = Object.values(this.searchTypes)
      .filter((symbolSearchType) => symbolSearchType.prefix)
      .map((symbolSearchType) => ({
        shortcut: symbolSearchType.prefix,
        label: index++ + `?\tType "${symbolSearchType.prefix}" ${symbolSearchType.label}`,
      }));
    items.push({
      shortcut: '',
      label: '0?\tType anything in the input box to find files or filter by file path',
    });

    return items;
  }

  private getSearchTypes(config: vscode.WorkspaceConfiguration): { [name: string]: SymbolSearchType } {
    let searchTypes: { [name: string]: SymbolSearchType } = {
      Help: {
        prefix: '?',
        label: ' to show available prefix options',
        detectOnlyOnFirstChar: true,
        callFunction: this.getHelp,
      },
      Commands: {
        command: 'workbench.action.showCommands',
        label: ' to open the default Go To Command menu',
        detectOnlyOnFirstChar: true,
        callFunction: this.runCommand,
      },
      Symbols: {
        command: 'workbench.action.showAllSymbols',
        label: ' to open the default Go To Symbol in Workspace',
        detectOnlyOnFirstChar: true,
        callFunction: this.runCommand,
      },
      Recent: {
        command: 'workbench.action.quickOpen',
        label: ' to show recent files',
        detectOnlyOnFirstChar: true,
        callFunction: this.runCommand,
      },
      Functions: {
        symbolKinds: config.get('GoToAnything.symbols.Functions', []),
        label: ' to search for functions/methods within the selected file',
        ignore: ' callback',
        callFunction: this.findSymbols,
      },
      Declarations: {
        symbolKinds: config.get('GoToAnything.symbols.Declarations', []),
        label: ' to search for declarations within the selected file',
        callFunction: this.findSymbols,
      },
      Line: {
        prefix: ':',
        label: ' to go to line within the selected file',
        forceSearch: true,
        callFunction: this.addLine,
      },
    };
    Object.keys(searchTypes).forEach((searchName) => {
      if (searchTypes[searchName].prefix) return true;
      let prefix = config.get('GoToAnything.prefix.' + searchName, '');
      if (prefix) {
        searchTypes[searchName].prefix = config.get('GoToAnything.prefix.' + searchName);
      } else {
        delete searchTypes[searchName];
      }
    });

    return searchTypes;
  }

  private async getExcludePattern(workspaceUri: vscode.Uri): Promise<string> {
    const config = vscode.workspace.getConfiguration('', workspaceUri);
    const filesExclude = config.get<IgnoreRecord>('files.exclude', {});
    const searchExclude = config.get<IgnoreRecord>('search.exclude', {});
    const useGitIgnore = config.get<Boolean>('search.useIgnoreFiles');
    const ignore: IgnoreRecord = useGitIgnore ? await this.getIgnore('.ignore') : {};
    const gitIgnore: IgnoreRecord = useGitIgnore ? await this.getIgnore('.gitignore') : {};
    const exclude = { ...filesExclude, ...searchExclude, ...gitIgnore, ...ignore };
    const excludePatterns: string[] = Object.keys(exclude);
    console.log(exclude, excludePatterns);
    return excludePatterns.length ? '{' + excludePatterns.join(',') + '}' : '';
  }

  private async getIgnore(filename: string): Promise<IgnoreRecord> {
    let ignore: IgnoreRecord = {};
    const ignoreUri: vscode.Uri = vscode.Uri.file(this.workspaceFolder + '/' + filename);
    try {
      const ignroreBlob = await vscode.workspace.fs.readFile(ignoreUri);
      const ignoreString = new TextDecoder('utf-8').decode(ignroreBlob);
      ignoreString.split('\n').forEach((value: string) => {
        if (value.includes('#')) return;
        if (value.startsWith('!')) return;
        if (value.endsWith('/')) value = value.slice(0, -1);
        if (value.startsWith('**/')) ignore[value] = true;
        else ignore[`**/${value}`] = true;
      });
    } catch (error) {
      console.error(error);
    }
    return ignore;
  }

  private getCurrentUri(): vscode.Uri | undefined {
    if (this.currentItem && this.currentItem.uri) {
      return this.currentItem.uri;
    }
    if (this.originalUri) {
      return this.originalUri;
    }
    const editor = vscode.window.activeTextEditor;
    return editor ? editor.document.uri : undefined;
  }

  private async runCommand(search: SearchItem): Promise<QuickPickAnything[]> {
    if (search.type.hasOwnProperty('command') && search.type.command) {
      await vscode.commands.executeCommand(search.type.command);
    }
    return [];
  }
}
