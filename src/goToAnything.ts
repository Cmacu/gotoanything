import * as vscode from 'vscode';
import { isNumber } from 'util';

const HELP_PREFIX = '?';
const LINE_PREFIX = ':';
const FUNCTION_PREFIX = '@';
const DECLARATION_PREFIX = '$';
const COMMAND_PREFIX = '>';
const SYMBOL_PREFIX = '#';
const RECENT_PREFIX = '_';
const quickPickIcons = {
  0: '$(code)', // "File",
  1: '$(book)', // "Module",
  2: '$(three-bars)', // "Namespace",
  3: '$(package)', // "Package",
  4: '$(verified)', // "Class",
  5: '$(pulse)', // "Method",
  6: '$(plus)', // "Property",
  7: '$(pin)', // "Field",
  8: '$(plug)', // "Constructor",
  9: '$(organization-filled)', // "Enum",
  10: '$(lock)', // "Interface",
  11: '$(mention)', // "Function",
  12: '$(primitive-dot)', // "Variable",
  13: '$(primitive-square)', // "Constant",
  14: '$(quote)', // "String",
  15: '$(list-ordered)', // "Number",
  16: '$(law)', // "Boolean",
  17: '$(kebab-horizontal)', // "Array",
  18: '$(kebab-vertica)', // "Object",
  19: '$(key)', // "Key",
  20: '$(x)', // "Null",
  21: '$(person-filled)', // "EnumMember",
  22: '$(kebab-vertical)', // "Struct",
  23: '$(watch)', // "Event",
  24: '$(terminal)', // "Operator",
  25: '$(zap)', // "TypeParameter"
};
const FUNCTION_SYMBOL_KINDS = [5, 8, 11];
const DECLARATION_SYMBOL_KINDS = [4, 6, 7, 9, 10, 12, 13];

interface QuickPickAnything extends vscode.QuickPickItem {
  uri?: vscode.Uri;
  shortcut?: string;
  symbol?: string;
  range?: vscode.Range;
}
interface SymbolSearchType {
  name: string;
  prefix: string;
  label: string;
  callFunction: (search: SearchItem) => Promise<QuickPickAnything[]>;
  forceSearch?: boolean;
  symbolKinds?: number[];
  ignore?: string;
  command?: string;
}

interface SearchItem {
  type: SymbolSearchType;
  fileQuery: string;
  symbolQuery: string;
  forceSearch?: boolean;
}

interface SearchResult {
  success: boolean;
  items: QuickPickAnything[];
}

export default class GoToAnyting {
  private originalUri: vscode.Uri | undefined;
  private currentType: string = '';
  private currentItem: QuickPickAnything | undefined;
  private currentSymbols: { file: vscode.Uri; symbols: vscode.DocumentSymbol[] | undefined } | undefined;
  private workspaceFolder: string;
  private enablePreview: boolean;
  private previewDelay: number;
  private files: QuickPickAnything[] = [];
  // private items: QuickPickAnything[] = [];
  private searchTypes: SymbolSearchType[] = [
    {
      name: 'Functions',
      prefix: FUNCTION_PREFIX,
      symbolKinds: FUNCTION_SYMBOL_KINDS,
      label: "Type '" + FUNCTION_PREFIX + "' to search for functions/methods within the selected file",
      ignore: ' callback',
      callFunction: this.findSymbols,
    },
    {
      name: 'Declarations',
      prefix: DECLARATION_PREFIX,
      symbolKinds: DECLARATION_SYMBOL_KINDS,
      label: "Type '" + DECLARATION_PREFIX + "' to search for declarations within the selected file",
      callFunction: this.findSymbols,
    },
    {
      name: 'Line',
      prefix: LINE_PREFIX,
      label: "Type '" + LINE_PREFIX + "' to go to line within the selected file",
      forceSearch: true,
      callFunction: this.addLine,
    },
    {
      name: 'Commands',
      prefix: COMMAND_PREFIX,
      command: 'workbench.action.showCommands',
      label: "Type '" + COMMAND_PREFIX + "' to open the default Go To Command menu",
      callFunction: this.runCommand,
    },
    {
      name: 'Symbols',
      prefix: SYMBOL_PREFIX,
      command: 'workbench.action.showAllSymbols',
      label: "Type '" + SYMBOL_PREFIX + "' to open the default Go To Symbol in Workspace",
      callFunction: this.runCommand,
    },
    {
      name: 'Recent',
      prefix: RECENT_PREFIX,
      command: 'workbench.action.quickOpen',
      label: "Type '" + RECENT_PREFIX + "' to show recent files",
      callFunction: this.runCommand,
    },
    {
      name: 'Help',
      prefix: HELP_PREFIX,
      label: "Type '" + HELP_PREFIX + "' to show available prefix options",
      callFunction: this.getHelp,
    },
  ];

  public constructor() {
    const workspace = vscode.workspace.workspaceFolders![0];
    this.workspaceFolder = workspace ? workspace.uri.path : '';
    this.loadFiles(this.getExcludePattern(workspace.uri)).then(files => {
      this.files = files.map(file => this.processFile(file));
    });
    const config = vscode.workspace.getConfiguration();
    this.enablePreview = config.get('workbench.editor.enablePreview', true);
    this.previewDelay = config.get('GoToAnything.previewDelay', 250);
    this.originalUri = this.getCurrentUri();
    this.createQuickPick();
  }

  private createQuickPick(): void {
    const quickPick = vscode.window.createQuickPick<QuickPickAnything>();
    quickPick.placeholder = "Go To Anything. Type '" + HELP_PREFIX + "' for help";
    quickPick.matchOnDescription = true;
    quickPick.onDidChangeValue(value => this.onDidChangeValue(value, quickPick));
    quickPick.onDidChangeActive(items => this.onDidChangeActive(items, quickPick));
    quickPick.onDidHide(this.onDidHide);
    quickPick.onDidAccept(e => this.onDidAccept(e, quickPick));
    quickPick.show();
  }

  private onDidChangeValue(value: string, quickPick: vscode.QuickPick<QuickPickAnything>) {
    quickPick.busy = true;
    setTimeout(
      value => {
        if (quickPick.value == value) {
          return this.search(value)
            .then((result: SearchResult) => {
              if (result.success) quickPick.items = result.items;
              // else quickPick.items.filter(item=>)
            })
            .finally(() => (quickPick.busy = false));
        }
        quickPick.busy = false;
      },
      this.previewDelay,
      value
    );
  }

  private onDidChangeActive(items: QuickPickAnything[], quickPick: vscode.QuickPick<QuickPickAnything>) {
    if (!items || !items.length || !items[0] || !this.enablePreview) return;
    quickPick.busy = true;
    this.currentItem = items[0];
    setTimeout(
      item => {
        if (quickPick.activeItems && quickPick.activeItems[0].uri === item.uri) {
          return this.showItem(item, {
            preserveFocus: true,
            preview: true,
          }).then(isSelected => (quickPick.busy = false));
        }
        quickPick.busy = false;
      },
      this.previewDelay,
      this.currentItem
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
    if (this.currentType == search.type.name && !search.forceSearch) {
      return { success: false, items: [] };
    }
    return search.type.callFunction
      .call(this, search)
      .then(items => {
        this.currentType = search.type.name;
        return { success: true, items: items };
      })
      .catch(() => ({ success: false, items: [] }));
  }

  private showItem(item: QuickPickAnything, options: vscode.TextDocumentShowOptions): Thenable<boolean> {
    if (!item.uri) {
      return Promise.resolve(false);
    }
    return vscode.window.showTextDocument(item.uri, options).then(editor => {
      this.showRange(editor, item.range, item.symbol);
      return true;
    });
  }

  private showRange(
    editor: vscode.TextEditor | undefined,
    range: vscode.Range | undefined,
    symbol: string | undefined
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
      type: {
        name: 'Files',
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

    for (let searchType of this.searchTypes) {
      const symbolIndex = query.indexOf(searchType.prefix);
      if (!(symbolIndex < 0)) {
        return {
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
    item.label += LINE_PREFIX + search.symbolQuery;
    item.description += ' ' + search.fileQuery + LINE_PREFIX + search.symbolQuery;
    item.range = new vscode.Range(start, end);
    console.log(item);
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
        file
      );
      this.currentSymbols = { file: file, symbols: symbols };
    }
    return this.reduceSymbols(symbols, search.type).map(symbol =>
      this.processSymbol(symbol, search.fileQuery + search.type.prefix)
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

  private loadFiles(excludePattern: string): Thenable<vscode.Uri[]> {
    return vscode.workspace.findFiles('**/', excludePattern);
  }

  private async getHelp(): Promise<QuickPickAnything[]> {
    let index = 1;
    let items: QuickPickAnything[] = Object.values(this.searchTypes).map(symbolSearchType => ({
      shortcut: symbolSearchType.prefix,
      label: index++ + '?\t' + symbolSearchType.label,
    }));
    items.push({ shortcut: '', label: '0?\tType anything in the input box to find files or filter by file path' });

    return items;
  }

  private getExcludePattern(workspaceUri: vscode.Uri): string {
    const config = vscode.workspace.getConfiguration('', workspaceUri);
    let excludePatterns: string[] = [];
    Object.keys(config.get<Object>('files.exclude', {})).map(pattern => excludePatterns.push(pattern));
    Object.keys(config.get<Object>('search.exclude', {})).map(pattern => excludePatterns.push(pattern));
    return excludePatterns.length ? '{' + excludePatterns.join(',') + '}' : '';
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
