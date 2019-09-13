// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

export const MAX_FILE_RESULTS = 10;
export const HELP_PREFIX = "?";
export const LINE_PREFIX = ":";
export const FUNCTION_PREFIX = "@";
export const DECLARATION_PREFIX = "$";
export const LITERAL_PREFIX = "!";
export const FUNCTION_SYMBOL_KINDS = [5, 8, 11];
export const DECLARATION_SYMBOL_KINDS = [4, 6, 7, 9, 10, 12, 13];
export const LITERAL_SYMBOL_KINDS = [14, 15, 16, 20];

export const quickPickIcons = {
  0: "$(code)", // "File",
  1: "$(book)", // "Module",
  2: "$(three-bars)", // "Namespace",
  3: "$(package)", // "Package",
  4: "$(verified)", // "Class",
  5: "$(pulse)", // "Method",
  6: "$(plus)", // "Property",
  7: "$(pin)", // "Field",
  8: "$(plug)", // "Constructor",
  9: "$(organization-filled)", // "Enum",
  10: "$(lock)", // "Interface",
  11: "$(mention)", // "Function",
  12: "$(primitive-dot)", // "Variable",
  13: "$(primitive-square)", // "Constant",
  14: "$(quote)", // "String",
  15: "$(list-ordered)", // "Number",
  16: "$(law)", // "Boolean",
  17: "$(kebab-horizontal)", // "Array",
  18: "$(kebab-vertica)", // "Object",
  19: "$(key)", // "Key",
  20: "$(x)", // "Null",
  21: "$(person-filled)", // "EnumMember",
  22: "$(kebab-vertical)", // "Struct",
  23: "$(watch)", // "Event",
  24: "$(terminal)", // "Operator",
  25: "$(zap)" // "TypeParameter"
};

export interface QuickPickAnything extends vscode.QuickPickItem {
  uri?: vscode.Uri;
  shortcut?: string;
  symbol?: string;
  range?: vscode.Range;
  line?: number;
}

export interface SymbolSearchType {
  name: string;
  prefix: string;
  symbolKinds: number[];
  label: string;
  ignore?: string;
}

export class GoToAnytingHandler {
  private enablePreview: boolean;
  private previewDelay: number;
  private originalUri: vscode.Uri | undefined;
  private activeItem: QuickPickAnything | undefined;
  private findAnythingHandler: FindAnythingHandler;
  private quickPick: vscode.QuickPick<QuickPickAnything>;

  constructor() {
    const config = vscode.workspace.getConfiguration();
    this.enablePreview = config.get("workbench.editor.enablePreview", true);
    this.previewDelay = config.get("GoToAnything.previewDelay", 250);
    this.findAnythingHandler = new FindAnythingHandler();
    this.quickPick = this.create();
    this.register();
  }

  create(): vscode.QuickPick<QuickPickAnything> {
    const quickPick = vscode.window.createQuickPick<QuickPickAnything>();
    quickPick.placeholder = "Go To Anything. Type '" + HELP_PREFIX + "' for help";
    // quickPick.canSelectMany = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    return quickPick;
  }

  register(): void {
    this.quickPick.onDidChangeValue(value => {
      this.find(value);
    });

    this.quickPick.onDidChangeActive(value => {
      this.quickPick.busy = true;
      if (value[0]) {
        this.activeItem = value[0];
      }
      this.previewSelected(value).then(isSelected => {
        this.quickPick.busy = false;
      });
    });

    this.quickPick.onDidHide(e => {
      if (this.originalUri) {
        vscode.window.showTextDocument(this.originalUri);
      }
      this.activeItem = undefined;
      this.quickPick.value = "";
    });

    this.quickPick.onDidAccept(e => {
      this.openSelected().then(isOpened => {
        if (isOpened) {
          this.quickPick.hide();
        }
      });
    });
  }

  show(): void {
    const editor = vscode.window.activeTextEditor;
    this.originalUri = editor ? editor.document.uri : undefined;
    this.quickPick.show();
  }

  find(query: string): void {
    this.quickPick.busy = true;
    const file = this.activeItem ? this.activeItem.uri : undefined;
    this.findAnythingHandler.find(query, file).then(items => {
      this.quickPick.items = items ? items : [];
      this.previewSelected(items).then(isSelected => {
        this.quickPick.busy = false;
      });
    });
  }

  selectSymbolDefinition(
    editor: vscode.TextEditor | undefined,
    range: vscode.Range | undefined,
    symbol: string | undefined
  ): void {
    if (!editor || !symbol || !range) {
      return;
    }
    let start = range.start;
    let end = range.end;
    const textLine = editor.document.lineAt(range.start.line).text;
    const symbolStart = textLine.indexOf(symbol);
    if (symbolStart >= 0) {
      start = new vscode.Position(range.start.line, symbolStart);
      end = new vscode.Position(range.start.line, symbolStart + symbol.length);
    }
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), 1);
  }

  previewLine(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const lineIndex = this.quickPick.value.indexOf(LINE_PREFIX);
    if (lineIndex < 0) {
      return;
    }
    const lineInfo = this.quickPick.value.substr(lineIndex + 1);
    const position = lineInfo.split(":");
    let line = 0;
    let character = 0;
    if (position.length && !isNaN(+position[0])) {
      line = +position[0] - 1;
    }
    if (position.length > 1 && !isNaN(+position[1])) {
      character = +position[1] - 1;
    }
    const start = new vscode.Position(line, character);
    const end = new vscode.Position(line, character);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), 1);
  }

  getLineRange(line: string): vscode.Range | undefined {
    const lineNumber = +line;
    if (!isNaN(lineNumber)) {
      return new vscode.Range(new vscode.Position(lineNumber - 1, 0), new vscode.Position(lineNumber - 1, 200));
    }
    return undefined;
  }

  previewSelected(values: QuickPickAnything[] | undefined): Thenable<boolean> {
    if (!values || !values.length || !values[0] || !this.enablePreview) {
      return Promise.resolve(false);
    }
    const value = values[0];
    return new Promise(resolve =>
      setTimeout(
        (value, resolve) => {
          if (this.quickPick.activeItems && this.quickPick.activeItems[0] === value && value.uri) {
            let options: vscode.TextDocumentShowOptions = {
              preserveFocus: true,
              preview: true
            };
            return this.showSelected(value, options).then(isOpen => {
              resolve(isOpen);
            });
          }
          this.previewLine();
          resolve(false);
        },
        this.previewDelay,
        value,
        resolve
      )
    );
  }

  openSelected(): Thenable<boolean> {
    const items = this.quickPick.selectedItems;
    const item = items && items.length && items[0] ? items[0] : this.activeItem;
    if (!item) {
      return Promise.resolve(true);
    }
    if (item.shortcut) {
      this.quickPick.value = item.shortcut;
      this.find(this.quickPick.value);
      return Promise.resolve(false);
    }
    this.originalUri = undefined;
    return this.showSelected(item, { preview: false });
  }

  showSelected(item: QuickPickAnything, options: vscode.TextDocumentShowOptions): Thenable<boolean> {
    if (!item.uri) {
      this.previewLine();
      return Promise.resolve(false);
    }
    return vscode.window.showTextDocument(item.uri, options).then(editor => {
      this.selectSymbolDefinition(editor, item.range, item.symbol);
      this.previewLine();
      return true;
    });
  }
}

export class FindAnythingHandler {
  private workspaceFolder: string;
  private excludePattern: string;
  private symbolSearchTypes: SymbolSearchType[];
  private items: QuickPickAnything[] = [];

  constructor() {
    const workspace = vscode.workspace.workspaceFolders![0];
    this.workspaceFolder = workspace ? workspace.uri.path : "";

    const config = vscode.workspace.getConfiguration("", workspace.uri);
    let excludePatterns: string[] = [];
    Object.keys(config.get<Object>("files.exclude", {})).map(pattern => excludePatterns.push(pattern));
    Object.keys(config.get<Object>("search.exclude", {})).map(pattern => excludePatterns.push(pattern));
    this.excludePattern = excludePatterns.length ? "{" + excludePatterns.join(",") + "}" : "";

    this.findFiles().then(files => {
      this.items = files.map(file => {
        return this.processFile(file);
      });
    });
    this.symbolSearchTypes = [
      {
        name: "Functions",
        prefix: FUNCTION_PREFIX,
        symbolKinds: FUNCTION_SYMBOL_KINDS,
        label:
          HELP_PREFIX + " Type '" + FUNCTION_PREFIX + "' to search for functions/methods within the filtered files",
        ignore: " callback"
      },
      {
        name: "Declarations",
        prefix: DECLARATION_PREFIX,
        symbolKinds: DECLARATION_SYMBOL_KINDS,
        label:
          HELP_PREFIX +
          " Type '" +
          DECLARATION_PREFIX +
          "' to search for declarations (classes, variables, interfaces, etc) within the filtered files"
      },
      {
        name: "Literals",
        prefix: LITERAL_PREFIX,
        symbolKinds: LITERAL_SYMBOL_KINDS,
        label:
          HELP_PREFIX +
          " Type '" +
          LITERAL_PREFIX +
          "' to search for literals (numbers, strings, booleans, etc) within the filtered files"
      }
    ];
  }

  find(query: string, file: vscode.Uri | undefined): Thenable<QuickPickAnything[] | undefined> {
    // Empty
    if (!query || !query.length) {
      return Promise.resolve([]);
    }
    // Help
    if (query.indexOf(HELP_PREFIX) >= 0) {
      return Promise.resolve(this.help());
    }
    const editor = vscode.window.activeTextEditor;
    if (!file && editor) {
      file = editor.document.uri;
    }
    // Symbols
    for (let symbolSearchType of this.symbolSearchTypes) {
      const symbolIndex = query.indexOf(symbolSearchType.prefix);
      if (symbolIndex < 0) {
        continue;
      }
      query = query.substring(0, symbolIndex);
      if (!file) {
        return Promise.resolve([]);
      }
      return this.findSymbols(file).then(symbols =>
        this.reduceSymbols(symbols, symbolSearchType).map(symbol =>
          this.processSymbol(symbol, query + symbolSearchType.prefix)
        )
      );
    }
    // Files
    if (!query.length) {
      return Promise.resolve(file ? [this.processFile(file)] : []);
    } else {
      return Promise.resolve(this.items);
    }
  }

  reduceSymbols(symbols: vscode.DocumentSymbol[] | undefined, kind: SymbolSearchType): vscode.DocumentSymbol[] {
    let reduced: vscode.DocumentSymbol[] = [];
    if (symbols == undefined) {
      return reduced;
    }
    symbols.forEach((symbol: vscode.DocumentSymbol) => {
      if (kind.symbolKinds.includes(symbol.kind) && (!kind.ignore || symbol.name.indexOf(kind.ignore) < 0)) {
        reduced.push(symbol);
      }
      reduced = reduced.concat(this.reduceSymbols(symbol.children, kind));
    });
    return reduced;
  }

  processSymbol(symbol: vscode.DocumentSymbol, query: string): QuickPickAnything {
    const information = (symbol as unknown) as vscode.SymbolInformation;
    const file = information.location.uri;
    const parrent = information.containerName.length ? information.containerName + " in " : "";
    const icon = quickPickIcons[symbol.kind];
    const detail = vscode.SymbolKind[symbol.kind] + parrent + " in " + file.path.replace(this.workspaceFolder, "");
    const label = icon + " " + symbol.name;
    const description = query + symbol.name;
    return {
      uri: file,
      symbol: symbol.name,
      label: label,
      detail: detail,
      range: symbol.range,
      description: description
    };
  }

  findFiles(): Thenable<vscode.Uri[]> {
    return vscode.workspace.findFiles("**/", this.excludePattern);
  }

  findSymbols(file: vscode.Uri): Thenable<vscode.DocumentSymbol[] | undefined> {
    if (file === undefined) {
      // if there is no currently open file return empty array
      return Promise.resolve(undefined);
    }
    // return vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
    return vscode.commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", file);
  }

  processFile(file: vscode.Uri): QuickPickAnything {
    return {
      uri: file,
      label: "$(code) " + file.path.split("/").pop(),
      detail: file.path.replace(this.workspaceFolder, "")
    };
  }

  help(): QuickPickAnything[] {
    let helpItems: QuickPickAnything[] = this.symbolSearchTypes.map(symbolSearchType => ({
      shortcut: symbolSearchType.prefix,
      label: symbolSearchType.label
    }));
    helpItems.push({
      shortcut: "",
      label: HELP_PREFIX + " Start by typing anything in the input box to find files or filter by file path"
    });
    helpItems.push({
      shortcut: LINE_PREFIX,
      label: HELP_PREFIX + " Type '" + LINE_PREFIX + "' followed by the line number to open the file at this line"
    });
    return helpItems;
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand("extension.GoToAnything", () => {
    new GoToAnytingHandler().show();
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
