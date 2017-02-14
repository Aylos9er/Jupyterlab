// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  Kernel, KernelMessage
} from '@jupyterlab/services';

import {
  Message
} from 'phosphor/lib/core/messaging';

import {
  MimeData as IClipboard
} from 'phosphor/lib/core/mimedata';

import {
  defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  Token
} from 'phosphor/lib/core/token';

import {
  PanelLayout
} from 'phosphor/lib/ui/panel';

import {
  Widget, ResizeMessage
} from 'phosphor/lib/ui/widget';

import {
  BaseCellWidget, CodeCellWidget
} from '../cells';

import {
  IEditorMimeTypeService, CodeEditor
} from '../codeeditor';

import {
  CompleterModel, CompleterWidget, CompletionHandler
} from '../completer';

import {
  IChangedArgs
} from '../common/interfaces';

import {
  SizeWatcher
} from '../common/sizewatcher'

import {
  DocumentRegistry
} from '../docregistry';

import {
  OutputAreaWidget
} from '../outputarea';

import {
  RenderMime
} from '../rendermime';

import {
  Toolbar
} from '../toolbar';

import {
  INotebookModel
} from './model';

import {
  Notebook
} from './widget';


/**
 * The class name added to notebook panels.
 */
const NB_PANEL = 'jp-Notebook-panel';

/**
 * The class name added to a dirty widget.
 */
const DIRTY_CLASS = 'jp-mod-dirty';

/*
 * The width, below which, this panel will get the jp-width-tiny CSS class
*/
const TINY_WIDTH = 400;

/*
 * The width, below which, this panel will get the jp-width-small CSS class
*/
const SMALL_WIDTH = 600;

/**
 * A widget that hosts a notebook toolbar and content area.
 *
 * #### Notes
 * The widget keeps the document metadata in sync with the current
 * kernel on the context.
 */
export
class NotebookPanel extends Widget {
  /**
   * Construct a new notebook panel.
   */
  constructor(options: NotebookPanel.IOptions) {
    super();
    this.addClass(NB_PANEL);
    this.rendermime = options.rendermime;
    this.clipboard = options.clipboard;
    let factory = this.contentFactory = options.contentFactory;

    this.layout = new PanelLayout();
    let nbOptions = {
      rendermime: this.rendermime,
      languagePreference: options.languagePreference,
      contentFactory: factory.notebookContentFactory,
      mimeTypeService: options.mimeTypeService
    };
    this.notebook = factory.createNotebook(nbOptions);
    this.notebook.activeCellChanged.connect(this._onActiveCellChanged, this);
    let toolbar = factory.createToolbar();

    // Instantiate the SizeWatcher for adding/removing CSS classes based on with.
    this._widthWatcher = new SizeWatcher(
      { direction: "width", tinySize: TINY_WIDTH, smallSize: SMALL_WIDTH}
    );

    let layout = this.layout as PanelLayout;
    layout.addWidget(toolbar);
    layout.addWidget(this.notebook);

    // Instantiate the completer.
    this._completer = factory.createCompleter({ model: new CompleterModel() });

    // Set the completer widget's anchor widget to peg its position.
    this._completer.anchor = this.notebook;
    Widget.attach(this._completer, document.body);

    // Instantiate the completer handler.
    this._completerHandler = factory.createCompleterHandler({
      completer: this._completer
    });

    let activeCell = this.notebook.activeCell;
    if (activeCell) {
      this._completerHandler.editor = activeCell.editor;
    }
  }

  /**
   * A signal emitted when the panel has been activated.
   */
  readonly activated: ISignal<this, void>;

  /**
   * A signal emitted when the panel context changes.
   */
  readonly contextChanged: ISignal<this, void>;

  /**
   * A signal emitted when the kernel used by the panel changes.
   */
  readonly kernelChanged: ISignal<this, Kernel.IKernel>;

  /**
   * The factory used by the widget.
   */
  readonly contentFactory: NotebookPanel.IContentFactory;

  /**
   * The Rendermime instance used by the widget.
   */
  readonly rendermime: RenderMime;

  /**
   * The clipboard instance used by the widget.
   */
  readonly clipboard: IClipboard;

  /**
   * The notebook used by the widget.
   */
  readonly notebook: Notebook;

  /**
   * Get the toolbar used by the widget.
   */
  get toolbar(): Toolbar<Widget> {
    return (this.layout as PanelLayout).widgets.at(0) as Toolbar<Widget>;
  }

  /**
   * Get the current kernel used by the panel.
   */
  get kernel(): Kernel.IKernel {
    return this._context ? this._context.kernel : null;
  }

  /**
   * The model for the widget.
   */
  get model(): INotebookModel {
    return this.notebook ? this.notebook.model : null;
  }

  /**
   * The document context for the widget.
   *
   * #### Notes
   * Changing the context also changes the model on the
   * `content`.
   */
  get context(): DocumentRegistry.IContext<INotebookModel> {
    return this._context;
  }
  set context(newValue: DocumentRegistry.IContext<INotebookModel>) {
    newValue = newValue || null;
    if (newValue === this._context) {
      return;
    }
    let oldValue = this._context;
    this._context = newValue;
    this.rendermime.resolver = newValue;
    // Trigger private, protected, and public changes.
    this._onContextChanged(oldValue, newValue);
    this.onContextChanged(oldValue, newValue);
    this.contextChanged.emit(void 0);
  }

  /**
   * Dispose of the resources used by the widget.
   */
  dispose(): void {
    if (this._completer === null) {
      return;
    }
    let completer = this._completer;
    let completerHandler = this._completerHandler;
    this._completer = null;
    this._context = null;
    this._completerHandler = null;

    this.notebook.dispose();
    completerHandler.dispose();
    completer.dispose();
    super.dispose();
  }

  /**
   * Handle `'activate-request'` messages.
   */
  protected onActivateRequest(msg: Message): void {
    this.notebook.activate();
    this.activated.emit(void 0);
  }

  /*
   * Handle the ResizeMessage, adding/removing size based CSS classes.
   */
  protected onResize(msg: ResizeMessage): void {
    super.onResize(msg);
    let width = msg.width;
    if (this.parent.isVisible) {
      this._widthWatcher.update(width, this);
    }
  }

  /**
   * Handle a change to the document context.
   *
   * #### Notes
   * The default implementation is a no-op.
   */
  protected onContextChanged(oldValue: DocumentRegistry.IContext<INotebookModel>, newValue: DocumentRegistry.IContext<INotebookModel>): void {
    // This is a no-op.
  }


  /**
   * Handle a change in the model state.
   */
  protected onModelStateChanged(sender: INotebookModel, args: IChangedArgs<any>): void {
    if (args.name === 'dirty') {
      this._handleDirtyState();
    }
  }

  /**
   * Handle a change to the document path.
   */
  protected onPathChanged(sender: DocumentRegistry.IContext<INotebookModel>, path: string): void {
    this.title.label = path.split('/').pop();
  }

  /**
   * Handle a change in the context.
   */
  private _onContextChanged(oldValue: DocumentRegistry.IContext<INotebookModel>, newValue: DocumentRegistry.IContext<INotebookModel>): void {
    if (oldValue) {
      oldValue.kernelChanged.disconnect(this._onKernelChanged, this);
      oldValue.pathChanged.disconnect(this.onPathChanged, this);
      if (oldValue.model) {
        oldValue.model.stateChanged.disconnect(this.onModelStateChanged, this);
      }
    }
    if (!newValue) {
      this._onKernelChanged(null, null);
      return;
    }
    let context = newValue;
    context.kernelChanged.connect(this._onKernelChanged, this);
    let oldKernel = oldValue ? oldValue.kernel : null;
    if (context.kernel !== oldKernel) {
      this._onKernelChanged(this._context, this._context.kernel);
    }
    this.notebook.model = newValue.model;
    this._handleDirtyState();
    newValue.model.stateChanged.connect(this.onModelStateChanged, this);

    // Clear the cells when the context is initially populated.
    if (!newValue.isReady) {
      newValue.ready.then(() => {
        if (this.isDisposed) {
          return;
        }
        let model = newValue.model;
        // Clear the undo state of the cells.
        if (model) {
          model.cells.clearUndo();
        }
      });
    }

    // Handle the document title.
    this.onPathChanged(context, context.path);
    context.pathChanged.connect(this.onPathChanged, this);
  }

  /**
   * Handle a change in the kernel by updating the document metadata.
   */
  private _onKernelChanged(context: DocumentRegistry.IContext<INotebookModel>, kernel: Kernel.IKernel): void {
    this._completerHandler.kernel = kernel;
    this.kernelChanged.emit(kernel);
    if (!this.model || !kernel) {
      return;
    }
    kernel.ready.then(() => {
      if (this.model) {
        this._updateLanguage(kernel.info.language_info);
      }
    });
    this._updateSpec(kernel);
  }

  /**
   * Update the kernel language.
   */
  private _updateLanguage(language: KernelMessage.ILanguageInfo): void {
    let infoCursor = this.model.getMetadata('language_info');
    infoCursor.setValue(language);
  }

  /**
   * Update the kernel spec.
   */
  private _updateSpec(kernel: Kernel.IKernel): void {
    kernel.getSpec().then(spec => {
      if (this.isDisposed) {
        return;
      }
      let specCursor = this.model.getMetadata('kernelspec');
      specCursor.setValue({
        name: kernel.name,
        display_name: spec.display_name,
        language: spec.language
      });
    });
  }

  /**
   * Handle the dirty state of the model.
   */
  private _handleDirtyState(): void {
    if (!this.model) {
      return;
    }
    if (this.model.dirty) {
      this.title.className += ` ${DIRTY_CLASS}`;
    } else {
      this.title.className = this.title.className.replace(DIRTY_CLASS, '');
    }
  }

  /**
   * Handle a change to the active cell.
   */
  private _onActiveCellChanged(sender: Notebook, widget: BaseCellWidget) {
    let editor = widget ? widget.editor : null;
    this._completerHandler.editor = editor;
  }

  private _completer: CompleterWidget = null;
  private _completerHandler: CompletionHandler = null;
  private _context: DocumentRegistry.IContext<INotebookModel> = null;
  private _widthWatcher: SizeWatcher = null;
}


// Define the signals for the `NotebookPanel` class.
defineSignal(NotebookPanel.prototype, 'activated');
defineSignal(NotebookPanel.prototype, 'contextChanged');
defineSignal(NotebookPanel.prototype, 'kernelChanged');


/**
 * A namespace for `NotebookPanel` statics.
 */
export namespace NotebookPanel {
  /**
   * An options interface for NotebookPanels.
   */
  export
  interface IOptions {
    /**
     * The rendermime instance used by the panel.
     */
    rendermime: RenderMime;

    /**
     * The application clipboard.
     */
    clipboard: IClipboard;

    /**
     * The language preference for the model.
     */
    languagePreference?: string;

    /**
     * The content factory for the panel.
     */
    contentFactory: IContentFactory;

    /**
     * The mimeType service.
     */
    mimeTypeService: IEditorMimeTypeService;
  }

  /**
   * A content factory interface for NotebookPanel.
   */
  export
  interface IContentFactory {
    /**
     * The editor factory.
     */
    readonly editorFactory: CodeEditor.Factory;

    /**
     * The factory for notebook cell widget content.
     */
    readonly notebookContentFactory: Notebook.IContentFactory;

    /**
     * Create a new content area for the panel.
     */
    createNotebook(options: Notebook.IOptions): Notebook;

    /**
     * Create a new toolbar for the panel.
     */
    createToolbar(): Toolbar<Widget>;

    /**
     * The completer widget for a console widget.
     */
    createCompleter(options: CompleterWidget.IOptions): CompleterWidget;

    /**
     * The completer handler for a console widget.
     */
   createCompleterHandler(options: CompletionHandler.IOptions): CompletionHandler;
  }

  /**
   * The default implementation of an `IContentFactory`.
   */
  export
  class ContentFactory implements IContentFactory {
    /**
     * Creates a new renderer.
     */
    constructor(options: ContentFactory.IOptions) {
      this.editorFactory = options.editorFactory;
      this.notebookContentFactory = (options.notebookContentFactory ||
        new Notebook.ContentFactory({
          editorFactory: this.editorFactory,
          outputAreaContentFactory: options.outputAreaContentFactory,
          codeCellContentFactory: options.codeCellContentFactory,
          rawCellContentFactory: options.rawCellContentFactory,
          markdownCellContentFactory: options.markdownCellContentFactory
        })
      );
    }

    /**
     * The editor factory.
     */
    readonly editorFactory: CodeEditor.Factory;

    /**
     * The factory for notebook cell widget content.
     */
    readonly notebookContentFactory: Notebook.IContentFactory;

    /**
     * Create a new content area for the panel.
     */
    createNotebook(options: Notebook.IOptions): Notebook {
      return new Notebook(options);
    }

    /**
     * Create a new toolbar for the panel.
     */
    createToolbar(): Toolbar<Widget> {
      return new Toolbar();
    }

    /**
     * The completer widget for a console widget.
     */
    createCompleter(options: CompleterWidget.IOptions): CompleterWidget {
      return new CompleterWidget(options);
    }

    /**
     * The completer handler for a console widget.
     */
   createCompleterHandler(options: CompletionHandler.IOptions): CompletionHandler {
      return new CompletionHandler(options);
   }
  }

  /**
   * The namespace for `ContentFactory`.
   */
  export
  namespace ContentFactory {
    /**
     * An initialization options for a notebook panel content factory.
     */
    export
    interface IOptions {
      /**
       * The editor factory.
       */
      editorFactory: CodeEditor.Factory;

      /**
       * The factory for output area content.
       */
      outputAreaContentFactory?: OutputAreaWidget.IContentFactory;

      /**
       * The factory for code cell widget content.  If given, this will
       * take precedence over the `outputAreaContentFactory`.
       */
      codeCellContentFactory?: CodeCellWidget.IContentFactory;

      /**
       * The factory for raw cell widget content.
       */
      rawCellContentFactory?: BaseCellWidget.IContentFactory;

      /**
       * The factory for markdown cell widget content.
       */
      markdownCellContentFactory?: BaseCellWidget.IContentFactory;

      /**
       * The factory for notebook cell widget content. If given, this will
       * take precedence over the the cell and output area factories.
       */
      notebookContentFactory?: Notebook.IContentFactory;
    }
  }

  /* tslint:disable */
  /**
   * The notebook renderer token.
   */
  export
  const IContentFactory = new Token<IContentFactory>('jupyter.services.notebook.content-factory');
  /* tslint:enable */
}
