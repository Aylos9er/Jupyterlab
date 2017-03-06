// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import 'codemirror/addon/edit/matchbrackets.js';
import 'codemirror/addon/edit/closebrackets.js';
import 'codemirror/addon/comment/comment.js';
import 'codemirror/keymap/vim.js';

import {
  Menu
} from '@phosphor/widgets';

import {
  JupyterLab, JupyterLabPlugin
} from '../application';

import {
  IEditorServices
} from '../codeeditor';

import {
  ICommandPalette
} from '../commandpalette';

import {
  IEditorTracker, CommandIDs as EditorCommandIDs
} from '../editorwidget';

import {
  IMainMenu
} from '../mainmenu';

import {
  editorServices, CodeMirrorEditor, CommandIDs
} from '.';


/**
 * The editor services.
 */
export
const servicesPlugin: JupyterLabPlugin<IEditorServices> = {
  id: IEditorServices.name,
  provides: IEditorServices,
  activate: (): IEditorServices => editorServices
};


/**
 * The editor commands.
 */
export
const commandsPlugin: JupyterLabPlugin<void> = {
  id: 'jupyter.services.codemirror-commands',
  requires: [IEditorTracker, IMainMenu, ICommandPalette],
  activate: activateEditorCommands,
  autoStart: true
};


/**
 * Export the plugins as default.
 */
const plugins: JupyterLabPlugin<any>[] = [commandsPlugin, servicesPlugin];
export default plugins;


/**
 * Set up the editor widget menu and commands.
 */
function activateEditorCommands(app: JupyterLab, tracker: IEditorTracker, mainMenu: IMainMenu, palette: ICommandPalette): void {
  let { commands } = app;

  /**
   * Toggle editor matching brackets
   */
  function toggleMatchBrackets(): void {
    if (tracker.currentWidget) {
      let editor = tracker.currentWidget.editor;
      if (editor instanceof CodeMirrorEditor) {
        let cm = editor.editor;
        cm.setOption('matchBrackets', !cm.getOption('matchBrackets'));
      }
    }
  }

  /**
   * Toggle the editor's vim mode
   */
  function toggleVim(): void {
    tracker.forEach(widget => {
      if (widget.editor instanceof CodeMirrorEditor) {
        let cm = widget.editor.editor;
        let keymap = cm.getOption('keyMap') === 'vim' ? 'default'
        : 'vim';
        cm.setOption('keyMap', keymap);
      }
    });
  }

  /**
   * Create a menu for the editor.
   */
  function createMenu(): Menu {
    let theme = new Menu({ commands });
    let menu = new Menu({ commands });

    menu.title.label = 'Editor';
    theme.title.label = 'Theme';

    commands.addCommand(CommandIDs.changeTheme, {
      label: args => args['theme'] as string,
      execute: args => {
        let name = args['theme'] as string || CodeMirrorEditor.DEFAULT_THEME;
        tracker.forEach(widget => {
          if (widget.editor instanceof CodeMirrorEditor) {
            let cm = widget.editor.editor;
            cm.setOption('theme', name);
          }
        });
      }
    });

    [
     'jupyter', 'default', 'abcdef', 'base16-dark', 'base16-light',
     'hopscotch', 'material', 'mbo', 'mdn-like', 'seti', 'the-matrix',
     'xq-light', 'zenburn'
    ].forEach(name => theme.addItem({
      command: 'codemirror:change-theme',
      args: { theme: name }
    }));

    menu.addItem({ command: EditorCommandIDs.lineNumbers });
    menu.addItem({ command: EditorCommandIDs.lineWrap });
    menu.addItem({ command: CommandIDs.matchBrackets });
    menu.addItem({ command: CommandIDs.vimMode });
    menu.addItem({ type: 'separator' });
    menu.addItem({ type: 'submenu', submenu: theme });

    return menu;
  }

  mainMenu.addMenu(createMenu(), { rank: 30 });

  commands.addCommand(CommandIDs.matchBrackets, {
    execute: () => { toggleMatchBrackets(); },
    label: 'Toggle Match Brackets',
  });

  commands.addCommand(CommandIDs.vimMode, {
    execute: () => { toggleVim(); },
    label: 'Toggle Vim Mode'
  });

  [
    EditorCommandIDs.lineNumbers,
    EditorCommandIDs.lineWrap,
    CommandIDs.matchBrackets,
    CommandIDs.vimMode,
    EditorCommandIDs.createConsole,
    EditorCommandIDs.runCode
  ].forEach(command => palette.addItem({ command, category: 'Editor' }));

}
