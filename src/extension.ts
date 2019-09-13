// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { close } from "inspector";

// TODO: close previews
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

export interface GoToAnythingSettings {
  workspaceFolder: string;
  maxFileResults: number;
  excludePattern: string;
}

export class GoToAnytingHandler {
  private static instance: GoToAnytingHandler;
  private findAnythingHandler: FindAnythingHandler;
  private quickPick: vscode.QuickPick<QuickPickAnything>;
  private openDocuments: vscode.TextDocument[] = [];
  private previewEditors: vscode.TextEditor[] = [];
  private closeEditor: vscode.TextEditor | undefined;

  private constructor() {
    this.findAnythingHandler = new FindAnythingHandler();
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
      if (this.closeEditor) {
        this.closeEditor.show();
        vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      }
      this.quickPick.value = "";
    });

    this.quickPick.onDidAccept(e => {
      this.openSelected().then(isOpened => {
        if (isOpened) {
          this.quickPick.hide();
        }
      });
    });

    vscode.workspace.onDidOpenTextDocument(document => {
      setTimeout(
        document => {
          this.previewEditors.forEach(editor => {
            if (editor && editor.document.uri.path === document.uri.path) {
              editor;
              this.closeEditor = editor;
            }
          });
        },
        200,
        document
      );
    });
  }

  show(): void {
    this.previewEditors = [];
    this.closeEditor = undefined;
    this.quickPick.show();
    this.find(this.quickPick.value);
  }

  find(query: string): void {
    this.quickPick.busy = true;
    this.findAnythingHandler.find(query).then(items => {
      this.quickPick.items = items ? items : [];
      this.preview(items);
      this.quickPick.busy = false;
    });
  }

  preview(values: QuickPickAnything[] | undefined) {
    if (!values || !values.length || !values[0]) {
      return;
    }
    this.quickPick.busy = true;
    const value = values[0];
    setTimeout(
      value => {
        if (this.quickPick.activeItems && this.quickPick.activeItems[0] === value && value.uri) {
          let options: vscode.TextDocumentShowOptions = {
            preserveFocus: true
          };
          if (value.range) {
            options.selection = value.range;
          }
          vscode.window.showTextDocument(value.uri, options).then((editor: vscode.TextEditor) => {
            this.previewEditors.push(editor);
            if (editor && value.symbol && value.range) {
              this.selectSymbolDefinition(editor, value.range, value.symbol);
            }
            this.quickPick.busy = false;
          });
        }
        const lineIndex = this.quickPick.value.indexOf(LINE_PREFIX);
        if (lineIndex >= 0) {
          this.previewLine(this.quickPick.value.substr(lineIndex + 1));
        }
      },
      250,
      value
    );
  }

  selectSymbolDefinition(editor: vscode.TextEditor, range: vscode.Range, symbol: string): void {
    const textLine = editor.document.lineAt(range.start.line).text;
    console.log(textLine);
    const symbolStart = textLine.indexOf(symbol);
    if (symbolStart >= 0) {
      const start = new vscode.Position(range.start.line, symbolStart);
      const end = new vscode.Position(range.start.line, symbolStart + symbol.length);
      editor.selection = new vscode.Selection(start, end);
      editor.revealRange(new vscode.Range(start, end), 1);
    }
  }

  previewLine(line: string): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const positions = line.split(":");
    let thisLine = 0;
    let thisColumn = 0;
    if (positions.length && !isNaN(+positions[0])) {
      thisLine = +positions[0] - 1;
    }
    if (positions.length > 1 && !isNaN(+positions[1])) {
      thisColumn = +positions[1] - 1;
    }
    const start = new vscode.Position(thisLine, thisColumn);
    const end = new vscode.Position(thisLine, thisColumn);
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

  openSelected(): Thenable<boolean> {
    const items = this.quickPick.selectedItems;
    if (!items || !items.length || !items[0]) {
      return Promise.resolve(true);
    }
    if (items[0].shortcut) {
      this.quickPick.value = items[0].shortcut;
      this.find(this.quickPick.value);
      return Promise.resolve(false);
    }
    if (!items[0].uri) {
      return Promise.resolve(true);
    }
    return vscode.window
      .showTextDocument(items[0].uri, {
        preview: false,
        selection: items[0].range
      })
      .then(editor => {
        if (this.closeEditor && this.closeEditor.document.uri.path != editor.document.uri.path) {
          this.closeEditor = undefined;
        }
        return Promise.resolve(true);
      });
  }
}

export class FindAnythingHandler {
  private settings: GoToAnythingSettings;
  private symbolSearchTypes: SymbolSearchType[];
  private files: QuickPickAnything[] = [];

  constructor() {
    this.settings = this.getSettings();
    this.findFiles().then(files => (this.files = files));
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

  getSettings(): GoToAnythingSettings {
    const config = vscode.workspace.getConfiguration("GoToAnything");
    const workspace = vscode.workspace.workspaceFolders![0];
    return {
      workspaceFolder: workspace ? workspace.uri.path : "",
      maxFileResults: config.get<number>("maxFileResults", MAX_FILE_RESULTS),
      excludePattern: config.get<string>("excludePattern", EXCLUDE_PATTERN)
    };
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
      return this.findSymbols(file).then(symbols => this.processSymbols(symbols, symbolSearchType, query));
    }
    // Files
    if (!query.length) {
      return Promise.resolve(editor ? [this.processFile(editor.document.uri)] : []);
    } else {
      return Promise.resolve(this.files);
    }
  }

  processSymbols(
    symbols: vscode.DocumentSymbol[] | undefined,
    kind: SymbolSearchType,
    query: string
  ): QuickPickAnything[] {
    let items: QuickPickAnything[] = [];
    if (symbols == undefined) {
      return items;
    }
    symbols.forEach((symbol: vscode.DocumentSymbol) => {
      const information = (symbol as unknown) as vscode.SymbolInformation;
      const file = information.location.uri;
      if (kind.symbolKinds.includes(symbol.kind) && (!kind.ignore || symbol.name.indexOf(kind.ignore) < 0)) {
        const icon = quickPickIcons[symbol.kind];
        const detail = vscode.SymbolKind[symbol.kind] + " in " + file.path.replace(this.settings.workspaceFolder, "");
        const label = icon + " " + symbol.name;
        const range = symbol.range;
        const description = query + kind.prefix + symbol.name;
        items.push({
          uri: file,
          symbol: symbol.name,
          label: label,
          detail: detail,
          range: range,
          description: description
        });
      }
      items = items.concat(this.processSymbols(symbol.children, kind, query));
    });
    return items;
  }

  findFiles(): Thenable<QuickPickAnything[]> {
    return vscode.workspace
      .findFiles("**/", this.settings.excludePattern)
      .then(files => files.map(file => this.processFile(file)));
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
    const anythingItem: QuickPickAnything = {
      uri: file,
      label: "$(code) " + file.path.split("/").pop(),
      detail: file.path.replace(this.settings.workspaceFolder, "")
      // description: file.scheme
    };
    // if (line) {
    //   anythingItem.description += " " + query + LINE_PREFIX + line;
    //   anythingItem.line = +line;
    // }

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
