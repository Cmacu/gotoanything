import * as vscode from "vscode";

export const HELP_PREFIX = "?";
export const LINE_PREFIX = ":";

const FUNCTION_PREFIX = "@";
const DECLARATION_PREFIX = "$";
const LITERAL_PREFIX = "!";
const COMMAND_PREFIX = ">";
const SYMBOL_PREFIX = "#";
const RECENT_PREFIX = "_";
const FUNCTION_SYMBOL_KINDS = [5, 8, 11];
const DECLARATION_SYMBOL_KINDS = [4, 6, 7, 9, 10, 12, 13];
const LITERAL_SYMBOL_KINDS = [14, 15, 16, 20];
const quickPickIcons = {
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

interface SymbolSearchType {
  name: string;
  prefix: string;
  label: string;
  symbolKinds?: number[];
  ignore?: string;
  command?: string;
}

export default class FindAnything {
  private workspaceFolder: string;
  private items: QuickPickAnything[] = [];
  private symbolSearchTypes: SymbolSearchType[];

  public constructor() {
    const workspace = vscode.workspace.workspaceFolders![0];
    this.workspaceFolder = workspace ? workspace.uri.path : "";
    this.findFiles(this.getExcludePattern(workspace.uri)).then(files => {
      this.items = files.map(file => {
        return this.processFile(file);
      });
    });
    this.symbolSearchTypes = this.getSearchTypes();
  }

  public find(query: string, file: vscode.Uri | undefined): Thenable<QuickPickAnything[]> {
    // Empty
    if (!query || !query.length) {
      return Promise.resolve([]);
    }
    // Help
    if (query.indexOf(HELP_PREFIX) >= 0) {
      return Promise.resolve(this.help());
    }
    // Symbols
    for (let symbolSearchType of this.symbolSearchTypes) {
      const symbolIndex = query.indexOf(symbolSearchType.prefix);
      if (symbolIndex < 0) {
        continue;
      }
      if (symbolSearchType.command) {
        if (symbolIndex !== 0) {
          continue;
        }
        vscode.commands.executeCommand(symbolSearchType.command);
      }
      if (!file) {
        return Promise.resolve([]);
      }
      query = query.substring(0, symbolIndex);
      return this.findSymbols(file).then(symbols =>
        this.reduceSymbols(symbols, symbolSearchType).map(symbol =>
          this.processSymbol(symbol, query + symbolSearchType.prefix)
        )
      );
    }
    // Files
    return Promise.resolve(query.length ? this.items : file ? [this.processFile(file)] : []);
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

  private findFiles(excludePattern: string): Thenable<vscode.Uri[]> {
    return vscode.workspace.findFiles("**/", excludePattern);
  }

  private findSymbols(file: vscode.Uri): Thenable<vscode.DocumentSymbol[] | undefined> {
    if (file === undefined) {
      return Promise.resolve(undefined);
    }
    return vscode.commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", file);
  }

  private processFile(file: vscode.Uri): QuickPickAnything {
    return {
      uri: file,
      label: "$(code) " + file.path.split("/").pop(),
      detail: file.path.replace(this.workspaceFolder, "")
    };
  }

  private help(): QuickPickAnything[] {
    let index = 2;
    let items: QuickPickAnything[] = this.symbolSearchTypes.map(symbolSearchType => ({
      shortcut: symbolSearchType.prefix,
      label: index++ + "?\t" + symbolSearchType.label
    }));
    items.push({ label: "0?\tType anything in the input box to find files or filter by file path" });
    items.push({
      shortcut: LINE_PREFIX,
      label: "1?\tType '" + LINE_PREFIX + "' to go to a line within the filtered files"
    });

    return items;
  }

  private getExcludePattern(workspaceUri: vscode.Uri): string {
    const config = vscode.workspace.getConfiguration("", workspace.uri);
    let excludePatterns: string[] = [];
    Object.keys(config.get<Object>("files.exclude", {})).map(pattern => excludePatterns.push(pattern));
    Object.keys(config.get<Object>("search.exclude", {})).map(pattern => excludePatterns.push(pattern));
    return excludePatterns.length ? "{" + excludePatterns.join(",") + "}" : "";
  }

  private getSearchTypes(): SymbolSearchType[] {
    return [
      {
        name: "Functions",
        prefix: FUNCTION_PREFIX,
        symbolKinds: FUNCTION_SYMBOL_KINDS,
        label: "Type '" + FUNCTION_PREFIX + "' to search for functions/methods within the filtered files",
        ignore: " callback"
      },
      {
        name: "Declarations",
        prefix: DECLARATION_PREFIX,
        symbolKinds: DECLARATION_SYMBOL_KINDS,
        label: "Type '" + DECLARATION_PREFIX + "' to search for declarations within the filtered files"
      },
      {
        name: "Literals",
        prefix: LITERAL_PREFIX,
        symbolKinds: LITERAL_SYMBOL_KINDS,
        label: "Type '" + LITERAL_PREFIX + "' to search for literals within the filtered files"
      },
      {
        name: "Commands",
        prefix: COMMAND_PREFIX,
        command: "workbench.action.showCommands",
        label: "Type '" + COMMAND_PREFIX + "' to open the default Go To Command menu"
      },
      {
        name: "Workspace Symbols",
        prefix: SYMBOL_PREFIX,
        command: "workbench.action.showAllSymbols",
        label: "Type '" + SYMBOL_PREFIX + "' to open the default Go To Symbol in Workspace"
      },
      {
        name: "Recent Files",
        prefix: RECENT_PREFIX,
        command: "workbench.action.quickOpen",
        label: "Type '" + RECENT_PREFIX + "' to show recent files"
      }
    ];
  }
}
