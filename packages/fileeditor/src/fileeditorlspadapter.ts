import { CodeEditor } from '@jupyterlab/codeeditor';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { IDocumentWidget } from '@jupyterlab/docregistry';
import {
  IAdapterOptions,
  IVirtualPosition,
  VirtualDocument,
  WidgetAdapter
} from '@jupyterlab/lsp';
import { FileEditor } from './widget';

export class FileEditorAdapter extends WidgetAdapter<
  IDocumentWidget<FileEditor>
> {
  constructor(
    options: IAdapterOptions,
    editorWidget: IDocumentWidget<FileEditor>
  ) {
    super(options, editorWidget);
    this.editor = editorWidget.content;
    this.initialized = new Promise<void>((resolve, reject) => {
      this.initOnceReady().then(resolve).catch(reject);
    });
  }

  /**
   * The wrapped `FileEditor` widget.
   *
   */
  readonly editor: FileEditor;

  /**
   * Get current path of the document.
   */
  get documentPath(): string {
    return this.widget.context.path;
  }

  /**
   * Get the mime type of the document.
   */
  get mimeType(): string {
    const codeMirrorMimeType = this.editor.model.mimeType;
    const contentsModel = this.editor.context.contentsModel;

    // when MIME type is not known it defaults to 'text/plain',
    // so if it is different we can accept it as it is
    if (codeMirrorMimeType != 'text/plain') {
      return codeMirrorMimeType;
    } else if (contentsModel) {
      // a script that does not have a MIME type known by the editor
      // (no syntax highlight mode), can still be known by the document
      // registry (and this is arguably easier to extend), so let's check it
      // just in case; this is also how the "Klingon" language for testing
      // gets registered, so we need it for tests too.
      let fileType =
        this.options.app.docRegistry.getFileTypeForModel(contentsModel);
      return fileType.mimeTypes[0];
    } else {
      // "text/plain" this is
      return codeMirrorMimeType;
    }
  }

  /**
   * Get the file extension of the document.
   */
  get languageFileExtension(): string {
    let parts = this.documentPath.split('.');
    return parts[parts.length - 1];
  }

  /**
   * Get the CM editor
   */
  get ceEditor(): CodeMirrorEditor {
    return this.editor.editor as CodeMirrorEditor;
  }

  /**
   * Get the activated CM editor.
   */
  get activeEditor(): CodeEditor.IEditor {
    return this.editor.editor;
  }

  /**
   * Get the inner HTMLElement of the document widget.
   */
  get wrapperElement(): HTMLElement {
    return this.widget.node;
  }

  /**
   * Get current path of the document.
   */
  get path(): string {
    return this.widget.context.path;
  }

  /**
   *  Get the list of CM editors in the document, there is only one editor
   * in the case of file editor.
   */
  get editors(): { ceEditor: CodeEditor.IEditor; type: string }[] {
    return [{ ceEditor: this.editor.editor, type: 'code' }];
  }

  /**
   * Generate the virtual document associated with the document.
   */
  createVirtualDocument(): VirtualDocument {
    return new VirtualDocument({
      language: this.language,
      foreignCodeExtractors: this.options.foreignCodeExtractorsManager,
      path: this.documentPath,
      fileExtension: this.languageFileExtension,
      // notebooks are continuous, each cell is dependent on the previous one
      standalone: true,
      // notebooks are not supported by LSP servers
      hasLspSupportedFile: true
    });
  }

  /**
   * Get the index of editor from the cursor position in the virtual
   * document. Since there is only one editor, this method always return
   * 0
   *
   * @param position - the position of cursor in the virtual document.
   * @return {*}  {number} - index of the virtual editor
   */
  getEditorIndexAt(position: IVirtualPosition): number {
    return 0;
  }

  /**
   * Get the index of input editor
   *
   * @param {CodeEditor.IEditor} ceEditor - instance of the code editor
   *
   */
  getEditorIndex(ceEditor: CodeEditor.IEditor): number {
    return 0;
  }

  /**
   * Get the wrapper of input editor.
   *
   * @param {CodeEditor.IEditor} ceEditor
   * @return {*}  {HTMLElement}
   */
  getEditorWrapper(ceEditor: CodeEditor.IEditor): HTMLElement {
    return this.wrapperElement;
  }

  /**
   * Initialization function called once the editor and the LSP connection
   * manager is ready. This function will create the virtual document and
   * connect various signals.
   *
   */
  protected async initOnceReady(): Promise<void> {
    if (!this.editor.context.isReady) {
      await this.editor.context.ready;
    }
    await this.connectionManager.ready;
    this.initVirtual();

    // connect the document, but do not open it as the adapter will handle this
    // after registering all features
    this.connectDocument(this.virtualDocument, false).catch(console.warn);

    this.editor.model.mimeTypeChanged.connect(this.reloadConnection, this);
  }
}
