import * as vscode from "vscode";
import FindAnything, { QuickPickAnything, HELP_PREFIX, LINE_PREFIX } from "./findAnything";

export default class GoToAnyting {
  private enablePreview: boolean;
  private previewDelay: number;
  private originalUri: vscode.Uri | undefined;
  private activeItem: QuickPickAnything | undefined;
  private findAnything: FindAnything;
  private quickPick: vscode.QuickPick<QuickPickAnything>;

  public constructor() {
    const config = vscode.workspace.getConfiguration();
    this.enablePreview = config.get("workbench.editor.enablePreview", true);
    this.previewDelay = config.get("GoToAnything.previewDelay", 250);
    this.findAnything = new FindAnything();
    this.quickPick = this.create();
    this.register();
  }

  public show(): void {
    const editor = vscode.window.activeTextEditor;
    this.originalUri = editor ? editor.document.uri : undefined;
    this.quickPick.show();
  }

  public find(query: string): Thenable<boolean> {
    this.quickPick.busy = true;
    const file = this.activeItem ? this.activeItem.uri : undefined;
    return this.findAnything.find(query, file).then(items => {
      this.quickPick.items = items ? items : [];
      this.previewSelected(items).then(isSelected => {
        this.quickPick.busy = false;
      });
      return items ? true : false;
    });
  }

  private create(): vscode.QuickPick<QuickPickAnything> {
    const quickPick = vscode.window.createQuickPick<QuickPickAnything>();
    quickPick.placeholder = "Go To Anything. Type '" + HELP_PREFIX + "' for help";
    // quickPick.canSelectMany = true;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    return quickPick;
  }

  private register(): void {
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
        vscode.window.showTextDocument(this.originalUri, { preserveFocus: true });
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

  private selectSymbolDefinition(
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

  private previewLine(): void {
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

  private previewSelected(items: QuickPickAnything[] | undefined): Thenable<boolean> {
    if (!items || !items.length || !items[0] || !this.enablePreview) {
      return Promise.resolve(false);
    }
    const item = items[0];
    return new Promise(resolve =>
      setTimeout(
        (item, resolve) => {
          if (this.quickPick.activeItems && this.quickPick.activeItems[0] === item && item.uri) {
            let options: vscode.TextDocumentShowOptions = {
              preserveFocus: true,
              preview: true
            };
            return this.showSelected(item, options).then(isOpen => {
              resolve(isOpen);
            });
          }
          this.previewLine();
          resolve(false);
        },
        this.previewDelay,
        item,
        resolve
      )
    );
  }

  private openSelected(): Thenable<boolean> {
    this.originalUri = undefined;
    const items = this.quickPick.selectedItems;
    const item = items && items.length && items[0] ? items[0] : this.activeItem;
    if (!item) {
      return Promise.resolve(true);
    }
    if (item.shortcut) {
      this.quickPick.value = item.shortcut;
      this.find(this.quickPick.value).then(() => Promise.resolve(false));
    }
    return this.showSelected(item, { preview: false });
  }

  private showSelected(item: QuickPickAnything, options: vscode.TextDocumentShowOptions): Thenable<boolean> {
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
