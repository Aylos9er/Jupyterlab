import React from 'react';

import { JupyterLabPlugin, JupyterLab } from '@jupyterlab/application';

import { VDomRenderer, VDomModel } from '@jupyterlab/apputils';

import { CodeEditor } from '@jupyterlab/codeeditor';

import { IChangedArgs } from '@jupyterlab/coreutils';

import { IDocumentWidget, DocumentRegistry } from '@jupyterlab/docregistry';

import { IEditorTracker, FileEditor } from '@jupyterlab/fileeditor';

import {
  IStatusBar,
  interactiveItem,
  Popup,
  showPopup,
  TextItem
} from '@jupyterlab/statusbar';

import { Mode } from '@jupyterlab/codemirror';

import { CommandRegistry } from '@phosphor/commands';

import { JSONObject } from '@phosphor/coreutils';

import { ISignal } from '@phosphor/signaling';

import { Menu } from '@phosphor/widgets';

namespace EditorSyntaxComponent {
  export interface IProps {
    mode: string;
    handleClick: () => void;
  }
}

// tslint:disable-next-line:variable-name
const EditorSyntaxComponent = (
  props: EditorSyntaxComponent.IProps
): React.ReactElement<EditorSyntaxComponent.IProps> => {
  return <TextItem source={props.mode} onClick={props.handleClick} />;
};

/**
 * StatusBar item to change the language syntax highlighting of the file editor.
 */
class EditorSyntax extends VDomRenderer<EditorSyntax.Model>
  implements IEditorSyntax {
  constructor(opts: EditorSyntax.IOptions) {
    super();

    this._tracker = opts.tracker;
    this._commands = opts.commands;

    this._tracker.currentChanged.connect(this._onEditorChange);
    this.model = new EditorSyntax.Model(
      this._tracker.currentWidget && this._tracker.currentWidget.content.editor
    );

    this.addClass(interactiveItem);
    this.node.title = 'Change text editor syntax highlighting';
  }

  render() {
    if (this.model === null) {
      return null;
    } else {
      return (
        <EditorSyntaxComponent
          mode={this.model.mode}
          handleClick={this._handleClick}
        />
      );
    }
  }

  dispose() {
    super.dispose();

    this._tracker.currentChanged.disconnect(this._onEditorChange);
  }

  private _handleClick = () => {
    const modeMenu = new Menu({ commands: this._commands });
    let command = 'codemirror:change-mode';
    if (this._popup) {
      this._popup.dispose();
    }
    Mode.getModeInfo()
      .sort((a, b) => {
        let aName = a.name || '';
        let bName = b.name || '';
        return aName.localeCompare(bName);
      })
      .forEach(spec => {
        if (spec.mode.indexOf('brainf') === 0) {
          return;
        }

        let args: JSONObject = {
          insertSpaces: true,
          name: spec.name!
        };

        modeMenu.addItem({
          command,
          args
        });
      });
    this._popup = showPopup({
      body: modeMenu,
      anchor: this,
      align: 'left'
    });
  };

  private _onEditorChange = (
    tracker: IEditorTracker,
    editor: IDocumentWidget<FileEditor, DocumentRegistry.IModel> | null
  ) => {
    this.model!.editor = editor && editor.content.editor;
  };

  private _tracker: IEditorTracker;
  private _commands: CommandRegistry;
  private _popup: Popup | null = null;
}

namespace EditorSyntax {
  export class Model extends VDomModel implements IEditorSyntax.IModel {
    constructor(editor: CodeEditor.IEditor | null) {
      super();

      this.editor = editor;
    }

    get mode() {
      return this._mode;
    }

    get editor() {
      return this._editor;
    }

    set editor(editor: CodeEditor.IEditor | null) {
      const oldEditor = this._editor;
      if (oldEditor !== null) {
        oldEditor.model.mimeTypeChanged.disconnect(this._onMIMETypeChange);
      }

      const oldState = this._getAllState();
      this._editor = editor;
      if (this._editor === null) {
        this._mode = '';
      } else {
        const spec = Mode.findByMIME(this._editor.model.mimeType);
        this._mode = spec.name || spec.mode;

        this._editor.model.mimeTypeChanged.connect(this._onMIMETypeChange);
      }

      this._triggerChange(oldState, this._getAllState());
    }

    private _onMIMETypeChange = (
      mode: CodeEditor.IModel,
      change: IChangedArgs<string>
    ) => {
      const oldState = this._getAllState();
      const spec = Mode.findByMIME(change.newValue);
      this._mode = spec.name || spec.mode;

      this._triggerChange(oldState, this._getAllState());
    };

    private _getAllState(): string {
      return this._mode;
    }

    private _triggerChange(oldState: string, newState: string) {
      if (oldState !== newState) {
        this.stateChanged.emit(void 0);
      }
    }

    private _mode: string = '';
    private _editor: CodeEditor.IEditor | null = null;
  }

  export interface IOptions {
    tracker: IEditorTracker;
    commands: CommandRegistry;
  }
}

export interface IEditorSyntax {
  readonly model: IEditorSyntax.IModel | null;
  readonly modelChanged: ISignal<this, void>;
}

export namespace IEditorSyntax {
  export interface IModel {
    readonly mode: string;
    readonly editor: CodeEditor.IEditor | null;
  }
}

export const editorSyntaxStatus: JupyterLabPlugin<void> = {
  id: '@jupyterlab/codemirror-extension:editor-syntax-status',
  autoStart: true,
  requires: [IStatusBar, IEditorTracker],
  activate: (
    app: JupyterLab,
    statusBar: IStatusBar,
    tracker: IEditorTracker
  ) => {
    let item = new EditorSyntax({ tracker, commands: app.commands });
    statusBar.registerStatusItem('editor-syntax-item', item, {
      align: 'left',
      rank: 0,
      isActive: () =>
        app.shell.currentWidget &&
        tracker.currentWidget &&
        app.shell.currentWidget === tracker.currentWidget
    });
  }
};
