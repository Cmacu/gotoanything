# Go To Anything

Visual Studio Code plugin that displays a Quick Pick input with capabilities similar to Sublime Text 3 Go To Anything functions.

![gotofunctioninfile](/img/goto_file_function.gif)

## Instructions

**After installation use the default `Cmd+P/Ctrl+P` keyboard shortcut or `Go To Anything` command to open the extension**

## Contributing

Something missing? Found a bug? - Create a pull request or an issue.
[Github](https://github.com/Cmacu/gotoanything)

## Features

### Go to `function` in file by typing `@`

![gotofunctioninfile2](/img/goto_file_function2.gif)

Type anything to find files in the current workspace. Select the desired file and type `@` to load all functions in that file. If preview is enabled you will see the selected function in the editor. Press enter to open the file or press cancel to return to the previous editor.
If you type directly `@` it will load all functions in the currently opened file

### Go to `line` in file by typing `:`

![gotolineinfile](/img/goto_file_line.gif)

Type anything to find files in the current workspace. Select the desired file and type `:` and the line number to jump to the corresponding line

### Go to `declaration` in file by typing `$`

![gotosymbolinfile](/img/goto_file_class.gif)

Type anything to find files in the current workspace. Select the desired file and type `$` to load symbol declarations (constants, variables, interfaces, classes, etc) in that file. If preview is enabled you will see the selected declartion in the editor. Press enter to open the file or press cancel to return to the previous editor.
If you type `$` directly it will load all declarations in the currently opened file

### Go to `command` by typing `>`

![gotocommand](/img/goto_command.gif)

### For more options type `?` to open the help menu

![gotohelp](/img/goto_help.gif)

<!--
Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.
 -->

## Requirements

To display symbols properly this extension relies on the existing VSCode symbol detection that depends on the installed Language settings and packages. If symbol is not available as expected check if it's available in the native VSCode Go To Symbol in File.

## Extension Settings

The default shortcut is `Cmd+P` for Mac (`Ctrl+P` for Windows). To change it search for `Go To Anything` in the keyboard shortcut settings or add

```json
{
  "extension.GoToAnything": "keyboard shortcut"
}
```

to your `keybindings.json` file

This extension utilizes the following workspace settings:

- `workbench.editor.enablePreview` enables or disables the file preview functionality when changing the selected item
- `gotoanything.previewDelay`: The delay in miliseconds for displaying the selected dropdown item (only if preview is enabled)
- `files.exclude` and `search.exclude` are used as exclude patterns for the file search

## Known Issues

Pasting in the search box may not behave as expected since the extension rellies on selecting the file before filtering for symbols in file

## Release Notes

### 0.2.1

Return to original editor on cancel fix

### 0.2.0

Various bug fixes and speed improvements

### 0.1.0

Publised on VSCode Marketplace

### 0.0.1

Initial release

---

<!--
## Working with Markdown

**Note:** You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

- Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux)
- Toggle preview (`Shift+CMD+V` on macOS or `Shift+Ctrl+V` on Windows and Linux)
- Press `Ctrl+Space` (Windows, Linux) or `Cmd+Space` (macOS) to see a list of Markdown snippets

### For more information

- [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
- [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)
-->

## Road Map

- [ ] Enable prefix customizations
- [ ] Add tooltips when no results are found

## License

This software is released under [MIT License](http://www.opensource.org/licenses/mit-license.php)

**Enjoy!**
