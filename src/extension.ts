// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { throws } from "assert";

export const MAX_FILE_RESULTS = 10;
export const EXCLUDE_PATTERN = "";
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
  range?: vscode.Range;
  line?: number;
}

export interface SymbolSearchType {
  name: string;
  prefix: string;
  symbolKinds: number[];
  label: string;
}

export interface GoToAnythingSettings {
  workspaceFolder: string;
  maxFileResults: number;
  excludePattern: string;
}

export class GoToAnytingHandler {
  private static instance: GoToAnytingHandler;
  private quickPick: vscode.QuickPick<QuickPickAnything>;
  private preserveSearch: boolean;
  private currentUri: vscode.Uri | undefined;
  private closePreview: boolean = false;
  private findAnythingHandler: FindAnythingHandler;

  private constructor() {
    this.preserveSearch = vscode.workspace.getConfiguration("GoToAnything").get<boolean>("preserveSearch", true);
    this.findAnythingHandler = FindAnythingHandler.getInstance();
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
      this.find(value);
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
    if (!this.preserveSearch) {
      this.quickPick.value = "";
    }
    const editor = vscode.window.activeTextEditor;
    this.currentUri = editor ? editor.document.uri : undefined;
    this.quickPick.show();
    this.find(this.quickPick.value);
  }

  hide(): void {
    this.quickPick.hide();
  }

  find(query: string): void {
    this.quickPick.busy = true;
    this.findAnythingHandler.find(query).then(items => {
      console.log(items);
      this.quickPick.items = items ? items : [];
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

  openSelected(): boolean {
    const items = this.quickPick.selectedItems;
    if (!items || !items.length || !items[0]) {
      return true;
    }
    if (items[0].shortcut) {
      this.quickPick.value = items[0].shortcut;
      this.find(this.quickPick.value);
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

export class FindAnythingHandler {
  private static instance: FindAnythingHandler;
  private search: string | undefined;
  private searchLine: number | string | undefined;
  private settings: GoToAnythingSettings;
  private symbolSearchTypes: SymbolSearchType[];

  private constructor() {
    this.settings = this.getSettings();
    this.symbolSearchTypes = [
      {
        name: "Functions",
        prefix: FUNCTION_PREFIX,
        symbolKinds: FUNCTION_SYMBOL_KINDS,
        label: HELP_PREFIX + " Type '" + FUNCTION_PREFIX + "' to search for functions/methods within the filtered files"
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

  getSettings(): GoToAnythingSettings {
    const config = vscode.workspace.getConfiguration("GoToAnything");
    const workspace = vscode.workspace.workspaceFolders![0];
    return {
      workspaceFolder: workspace ? workspace.uri.path : "",
      maxFileResults: config.get<number>("maxFileResults", MAX_FILE_RESULTS),
      excludePattern: config.get<string>("excludePattern", EXCLUDE_PATTERN)
    };
  }

  static getInstance(): FindAnythingHandler {
    if (!FindAnythingHandler.instance) {
      FindAnythingHandler.instance = new FindAnythingHandler();
    }
    return FindAnythingHandler.instance;
  }

  find(query: string): Thenable<QuickPickAnything[] | undefined> {
    // Empty
    if (!query || !query.length) {
      return Promise.resolve([]);
    }
    // Help
    if (query.indexOf(HELP_PREFIX) >= 0) {
      return Promise.resolve(this.help());
    }
    const editor = vscode.window.activeTextEditor;
    // Symbols
    for (let symbolSearchType of this.symbolSearchTypes) {
      const symbolIndex = query.indexOf(symbolSearchType.prefix);
      if (symbolIndex < 0) {
        continue;
      }
      query = query.substring(0, symbolIndex);
      if (!editor) {
        return Promise.resolve([]);
      }
      const file = editor.document.uri;
      return this.findSymbols(file).then(symbols => this.processSymbols(symbols, file, symbolSearchType, query));
    }
    // Line
    let line: number = 0;
    const linePrefixIndex = query.indexOf(LINE_PREFIX);
    if (linePrefixIndex >= 0) {
      line = Number(query.substring(linePrefixIndex + 1));
      // line = isNaN(line) ? 0 : line;
      query = query.substring(0, linePrefixIndex);
    }
    // Files
    if (!query.length) {
      return Promise.resolve(editor ? [this.processFile(editor.document.uri, query, line)] : []);
    } else {
      return vscode.workspace
        .findFiles("**/*" + query + "*", this.settings.excludePattern, this.settings.maxFileResults)
        .then(files => files.map(file => this.processFile(file, query, line)));
    }
  }

  processSymbols(
    symbols: (vscode.DocumentSymbol | vscode.SymbolInformation)[] | undefined,
    file: vscode.Uri,
    kind: SymbolSearchType,
    query: string
  ): QuickPickAnything[] {
    let items: QuickPickAnything[] = [];
    if (symbols == undefined) {
      return items;
    }
    console.log(symbols);
    symbols.forEach(symbol => {
      if (kind.symbolKinds.includes(symbol.kind)) {
        const icon = quickPickIcons[symbol.kind];
        const detail = vscode.SymbolKind[symbol.kind] + " in " + file.path.replace(this.settings.workspaceFolder, "");
        const label = icon + " " + symbol.name;
        const range = symbol instanceof vscode.DocumentSymbol ? symbol.range : symbol.location.range;
        const description = query + kind.prefix + symbol.name;
        items.push({
          uri: file,
          label: label,
          detail: detail,
          range: range,
          description: description
        });
      }
      if (symbol instanceof vscode.DocumentSymbol) {
        items = items.concat(this.processSymbols(symbol.children, file, kind, query));
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

  processFile(file: vscode.Uri, query: string, line: number): QuickPickAnything {
    const anythingItem: QuickPickAnything = {
      uri: file,
      label: "$(code) " + file.path.split("/").pop(),
      detail: file.path.replace(this.settings.workspaceFolder, ""),
      description: file.scheme
    };
    if (line) {
      anythingItem.description += " " + query + LINE_PREFIX + line;
      anythingItem.line = +line;
    }

    return anythingItem;
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
    GoToAnytingHandler.getInstance().show();
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
