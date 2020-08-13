import { JupyterLabWidgetAdapter } from './jl_adapter';
import { FileEditor } from '@jupyterlab/fileeditor';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import * as CodeMirror from 'codemirror';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { LSPConnector } from './components/completion';
import { CodeEditor } from '@jupyterlab/codeeditor';
import { VirtualFileEditor } from '../../virtual/editors/file_editor';
import { LSPExtension } from '../../index';

export class FileEditorAdapter extends JupyterLabWidgetAdapter {
  editor: FileEditor;
  virtual_editor: VirtualFileEditor;
  protected current_completion_connector: LSPConnector;

  get document_path() {
    return this.widget.context.path;
  }

  get mime_type() {
    return this.editor.model.mimeType;
  }

  get language_file_extension(): string {
    let parts = this.document_path.split('.');
    return parts[parts.length - 1];
  }

  get ce_editor(): CodeMirrorEditor {
    return this.editor.editor as CodeMirrorEditor;
  }

  get cm_editor(): CodeMirror.Editor {
    return this.ce_editor.editor;
  }

  find_ce_editor(cm_editor: CodeMirror.Editor): CodeEditor.IEditor {
    return this.editor.editor;
  }

  constructor(
    extension: LSPExtension,
    editor_widget: IDocumentWidget<FileEditor>
  ) {
    super(extension, editor_widget, 'completer:invoke-file');
    this.editor = editor_widget.content;

    this.virtual_editor = new VirtualFileEditor(
      () => this.language,
      () => this.language_file_extension,
      () => this.document_path,
      this.cm_editor
    );
    this.connect_contentChanged_signal();

    console.log('LSP: file ready for connection:', this.path);

    // connect the document, but do not open it as the adapter will handle this
    // after registering all features
    this.connect_document(this.virtual_editor.virtual_document, false).catch(
      console.warn
    );

    this.editor.model.mimeTypeChanged.connect(this.reload_connection, this);
  }

  connect_completion() {
    this.current_completion_connector = new LSPConnector({
      editor: this.editor.editor,
      connections: this.connection_manager.connections,
      virtual_editor: this.virtual_editor,
      settings: this.completion_settings
    });
    this.extension.completion_manager.register({
      connector: this.current_completion_connector,
      editor: this.editor.editor,
      parent: this.widget
    });
  }

  get path() {
    return this.widget.context.path;
  }
}
