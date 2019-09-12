import * as vscode from "vscode";

export const HELP_PREFIX = "?";
export const LINE_PREFIX = ":";
export const DECLARATION_PREFIX = "$";
export const DECLARATION_SYMBOL_KINDS = [4, 6, 7, 9, 10, 12, 13];
export const FUNCTION_PREFIX = "@";
export const FUNCTION_SYMBOL_KINDS = [5, 8, 11];
export const MAX_FILE_RESULTS = 10;
export const EXCLUDE_PATTERN = "";

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
  range?: vscode.Range;
  line?: number;
}

export interface SymbolSearchType {
  name: string;
  symbolKinds: number[];
  prefix: string;
  doSearch: boolean;
}

export interface FindAnythingHandlerSettings {
  workspaceFolder: string;
  maxFileResults: number;
  excludePattern: string;
}

export class GoToAnytingHandler {
  private static instance: GoToAnytingHandler;
  private workspaceFolder: string;
  private config: vscode.WorkspaceConfiguration;
  private quickPick: vscode.QuickPick<QuickPickAnything>;
  private currentUri: vscode.Uri | undefined;
  private closePreview: boolean = false;

  private constructor() {
    this.config = vscode.workspace.getConfiguration("GoToAnything");
    const workspace = vscode.workspace.workspaceFolders![0];
    this.workspaceFolder = workspace ? workspace.uri.path : "";
    this.quickPick = this.create();
    this.register();
  }

  static getInstance(): GoToAnytingHandler {
    if (!GoToAnytingHandler.instance) {
      GoToAnytingHandler.instance = new GoToAnytingHandler();
    }
    return GoToAnytingHandler.instance;
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
      this.find();
    });

    this.quickPick.onDidChangeActive(value => {
      this.preview(value);
    });

    this.quickPick.onDidHide(e => {
      // TODO: detect if new preview was opened
      if (this.closePreview) {
        vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      }
    });

    this.quickPick.onDidAccept(e => {
      if (this.openSelected()) {
        this.hide();
      }
    });
  }

  show(): void {
    const preserveSearch = this.config.get("preserveSearch");
    if (!preserveSearch) {
      this.quickPick.value = "";
    }
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.currentUri = editor.document.uri;
    }
    this.quickPick.show();
    this.find();
  }

  hide(): void {
    this.quickPick.hide();
  }

  find(): void {
    let value = this.quickPick.value;
    if (value.indexOf(HELP_PREFIX) >= 0) {
      this.quickPick.items = this.help();
      return;
    }
    this.quickPick.busy = true;
    const settings = this.getSettings();
    new findAnythingHandler(value, settings).find().then(items => {
      this.quickPick.items = items;
      this.quickPick.busy = false;
    });
  }

  preview(values: QuickPickAnything[]) {
    if (!values || !values.length || !values[0]) {
      return;
    }
    const value = values[0];
    if (value.line) {
      value.range = this.getLineRange(value.line);
    }
    if (value.uri) {
      let options: vscode.TextDocumentShowOptions = {
        preserveFocus: true
      };
      if (value.range) {
        options.selection = value.range;
      }
      vscode.window.showTextDocument(value.uri, options).then((editor: vscode.TextEditor) => {
        this.closePreview = value.uri != this.currentUri;
      });
    }
  }

  getLineRange(line: number): vscode.Range {
    return new vscode.Range(new vscode.Position(line - 1, 0), new vscode.Position(line - 1, 200));
  }

  getSettings(): FindAnythingHandlerSettings {
    return {
      workspaceFolder: this.workspaceFolder,
      maxFileResults: this.config.get<number>("maxFileResults", MAX_FILE_RESULTS),
      excludePattern: this.config.get<string>("excludePattern", EXCLUDE_PATTERN)
    };
  }

  help(): QuickPickAnything[] {
    let helpItems: QuickPickAnything[] = [];
    helpItems.push({
      shortcut: "",
      label: HELP_PREFIX + " Start by typing anything in the input box to find files or filter by file path"
    });
    helpItems.push({
      shortcut: FUNCTION_PREFIX,
      label: HELP_PREFIX + " Type '" + FUNCTION_PREFIX + "' to find functions/methods within the filtered files"
    });
    helpItems.push({
      shortcut: DECLARATION_PREFIX,
      label: HELP_PREFIX + " Type '" + DECLARATION_PREFIX + "' to find classes/variables within the filtered files"
    });
    helpItems.push({
      shortcut: LINE_PREFIX,
      label: HELP_PREFIX + " Type '" + LINE_PREFIX + "' followed by the line number to open the file at this line"
    });
    return helpItems;
  }

  openSelected(): boolean {
    const items = this.quickPick.selectedItems;
    if (!items || !items.length || !items[0]) {
      return true;
    }
    if (items[0].shortcut) {
      this.quickPick.value = items[0].shortcut;
      this.find();
      return false;
    }
    if (!items[0].uri) {
      return true;
    }
    vscode.window.showTextDocument(items[0].uri, {
      preview: false,
      selection: items[0].range
    });
    this.closePreview = false;
    return true;
  }
}

export class findAnythingHandler {
  private search: string | undefined;
  private searchLine: number | string | undefined;
  private workspaceFolder: string;
  private maxFileResults: number;
  private excludePattern: string;
  private declarationSearch: SymbolSearchType = {
    name: "Declarations",
    prefix: DECLARATION_PREFIX,
    symbolKinds: DECLARATION_SYMBOL_KINDS,
    doSearch: false
  };
  private functionSearch: SymbolSearchType = {
    name: "Functions",
    prefix: FUNCTION_PREFIX,
    symbolKinds: FUNCTION_SYMBOL_KINDS,
    doSearch: false
  };

  constructor(search: string, settings: FindAnythingHandlerSettings) {
    // console.log(vscode.SymbolKind);
    this.search = search;
    this.workspaceFolder = settings.workspaceFolder;
    this.maxFileResults = settings.maxFileResults;
    this.excludePattern = settings.excludePattern;
    this.handleLinePrefix();
    this.handleSymbolPrefix(this.declarationSearch);
    this.handleSymbolPrefix(this.functionSearch);
  }

  handleLinePrefix(): void {
    if (!this.search) {
      return;
    }
    let linePrefixIndex = this.search.indexOf(LINE_PREFIX);
    if (linePrefixIndex >= 0) {
      const line = Number(this.search.substring(linePrefixIndex + 1));
      this.searchLine = !isNaN(line) ? line : "";
      this.search = this.search.substring(0, linePrefixIndex);
    } else {
      this.searchLine = undefined;
    }
  }

  handleSymbolPrefix(kind: SymbolSearchType): void {
    if (!this.search) {
      return;
    }
    let symbolIndex = this.search.indexOf(kind.prefix);
    if (symbolIndex >= 0) {
      this.search = this.search.substring(0, symbolIndex);
      kind.doSearch = true;
    } else {
      kind.doSearch = false;
    }
  }

  async find(): Promise<QuickPickAnything[]> {
    let files: vscode.Uri[] = [];
    if (this.search && this.search.length) {
      const pattern: string | vscode.RelativePattern = "**/" + this.search + "*";
      files = await vscode.workspace.findFiles(pattern, this.excludePattern, this.maxFileResults);
    } else {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        files.push(editor.document.uri);
      }
    }
    if (!files.length) {
      // TODO create help menu / recent files
      return Promise.resolve([]);
    }
    if (this.declarationSearch.doSearch) {
      return this.findSymbolsInFiles(this.declarationSearch, files);
    } else if (this.functionSearch.doSearch) {
      return this.findSymbolsInFiles(this.functionSearch, files);
    } else {
      return files.map(file => this.processFile(file));
    }
  }

  async findSymbolsInFiles(kind: SymbolSearchType, files: vscode.Uri[]): Promise<QuickPickAnything[]> {
    let items: QuickPickAnything[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const symbols = await this.findSymbols(file);
      if (!symbols) {
        continue;
      }
      items = items.concat(this.processSymbols(symbols, file, kind));
    }
    return items;
  }

  processSymbols(
    symbols: (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined,
    file: vscode.Uri,
    kind: SymbolSearchType
  ): QuickPickAnything[] {
    let items: QuickPickAnything[] = [];
    if (symbols == undefined) {
      return items;
    }

    symbols.forEach(symbol => {
      if (kind.symbolKinds.includes(symbol.kind)) {
        const icon = quickPickIcons[symbol.kind];
        const detail = file.path.replace(this.workspaceFolder, "");
        const label = icon + " " + symbol.name;
        const range = symbol instanceof vscode.DocumentSymbol ? symbol.range : symbol.location.range;
        items.push({
          uri: file,
          label: label,
          detail: detail,
          range: range,
          description: vscode.SymbolKind[symbol.kind] + "  " + this.search + kind.prefix + symbol.name
        });
      }
      if (symbol instanceof vscode.DocumentSymbol) {
        items = items.concat(this.processSymbols(symbol.children, file, kind));
      }
    });
    return items;
  }

  findSymbols(currentUri: vscode.Uri): Thenable<(vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined> {
    if (currentUri === undefined) {
      // if there is no currently open file return empty array
      return Promise.resolve(undefined);
    }
    return vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
      "vscode.executeDocumentSymbolProvider",
      currentUri
    );
  }

  processFile(file: vscode.Uri): QuickPickAnything {
    const anythingItem: QuickPickAnything = {
      uri: file,
      label: "$(code) " + file.path.split("/").pop(),
      detail: file.path.replace(this.workspaceFolder, ""),
      description: file.scheme
    };
    if (this.searchLine !== undefined) {
      anythingItem.description += " " + this.search + LINE_PREFIX + this.searchLine;
      anythingItem.line = +this.searchLine;
    }

    return anythingItem;
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand("extension.GoToAnything", () => {
    GoToAnytingHandler.getInstance().show();
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
