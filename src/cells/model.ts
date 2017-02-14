// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  nbformat, utils
} from '@jupyterlab/services';

import {
  JSONValue
} from '@phosphor/coreutils';

import {
  ISignal, Signal
} from '@phosphor/signaling';

import {
  IIterator, iter
} from '@phosphor/algorithm';

import {
  CodeEditor
} from '../codeeditor';

import {
  IChangedArgs
} from '../common/interfaces';

import {
  IObservableJSON, ObservableJSON
} from '../common/observablejson';

import {
  IObservableString, ObservableString
} from '../common/observablestring';

import {
  IObservableVector
} from '../common/observablevector';

import {
  IOutputAreaModel, OutputAreaModel
} from '../outputarea';

import {
  IRealtimeConverter, Synchronizable
} from '../common/realtime';


/**
 * The definition of a model object for a cell.
 */
export
interface ICellModel extends CodeEditor.IModel {
  /**
   * The type of the cell.
   */
  readonly type: nbformat.CellType;

  /**
   * A signal emitted when the content of the model changes.
   */
  readonly contentChanged: ISignal<ICellModel, void>;

  /**
   * A signal emitted when a model state changes.
   */
  readonly stateChanged: ISignal<ICellModel, IChangedArgs<any>>;

  /**
   * Whether the cell is trusted.
   */
  trusted: boolean;

  /**
   * The metadata associated with the cell.
   */
  readonly metadata: IObservableJSON;

  /**
   * Serialize the model to JSON.
   */
  toJSON(): nbformat.ICell;
}


/**
 * The definition of a code cell.
 */
export
interface ICodeCellModel extends ICellModel {
  /**
   * The type of the cell.
   *
   * #### Notes
   * This is a read-only property.
   */
  type: 'code';

  /**
   * The code cell's prompt number. Will be null if the cell has not been run.
   */
  executionCount: nbformat.ExecutionCount;

  /**
   * The cell outputs.
   */
  outputs: IOutputAreaModel;
}


/**
 * The definition of a markdown cell.
 */
export
interface IMarkdownCellModel extends ICellModel {
  /**
   * The type of the cell.
   */
  type: 'markdown';
 }


/**
 * The definition of a raw cell.
 */
export
interface IRawCellModel extends ICellModel {
  /**
   * The type of the cell.
   */
  type: 'raw';
}


/**
 * An implementation of the cell model.
 */
export
class CellModel extends CodeEditor.Model implements ICellModel {
  /**
   * Construct a cell model from optional cell content.
   */
  constructor(options: CellModel.IOptions) {
    super();
    this.value.changed.connect(this.onGenericChange, this);
    let cell = options.cell;
    this.set('cell_type', this.type);

    if (!cell) {
      return;
    }
    this._trusted = !!cell.metadata['trusted'];
    delete cell.metadata['trusted'];

    if (Array.isArray(cell.source)) {
      this.value.text = (cell.source as string[]).join('\n');
    } else {
      this.value.text = cell.source as string;
    }
    let metadata = utils.copy(cell.metadata);
    if (this.type !== 'raw') {
      delete metadata['format'];
    }
    if (this.type !== 'code') {
      delete metadata['collapsed'];
      delete metadata['scrolled'];
    }
    for (let key in metadata) {
      this._metadata.set(key, metadata[key]);
    }
    this._metadata.changed.connect(this.onGenericChange, this);
  }

  /**
   * The type of cell.
   */
  readonly type: nbformat.CellType;

  /**
   * A signal emitted when the state of the model changes.
   */
  readonly contentChanged = new Signal<this, void>(this);

  /**
   * A signal emitted when a model state changes.
   */
  readonly stateChanged = new Signal<this, IChangedArgs<any>>(this);

  /**
   * The metadata associated with the cell.
   */
  get metadata(): IObservableJSON {
    return this._metadata;
  }

  /**
   * Get the trusted state of the model.
   */
  get trusted(): boolean {
    return this._trusted;
  }

  /**
   * Set the trusted state of the model.
   */
  set trusted(newValue: boolean) {
    if (this._trusted === newValue) {
      return;
    }
    let oldValue = this._trusted;
    this._trusted = newValue;
    this.onTrustedChanged(newValue);
    this.stateChanged.emit({ name: 'trusted', oldValue, newValue });
  }

  /**
   * Dispose of the resources held by the model.
   */
  dispose(): void {
    this._metadata.dispose();
    super.dispose();
  }

  /**
   * Serialize the model to JSON.
   */
  toJSON(): nbformat.ICell {
    let metadata: nbformat.IBaseCellMetadata = Object.create(null);
    for (let key of this.metadata.keys()) {
      let value = JSON.parse(JSON.stringify(this.metadata.get(key)));
      metadata[key] = value as JSONValue;
    }
    if (this.trusted) {
      metadata['trusted'] = true;
    }
    return {
      cell_type: this.type,
      source: this.value.text,
      metadata,
    } as nbformat.ICell;
  }

  /**
   * Handle a change to the trusted state.
   *
   * The default implementation is a no-op.
   */
  onTrustedChanged(value: boolean): void { /* no-op */}

  /**
   * Handle a change to the observable value.
   */
  protected onGenericChange(): void {
    //this.set('outputs', this.get('outputs'));
    this.contentChanged.emit(void 0);
  }

  private _metadata = new ObservableJSON();
  private _trusted = false;
}


/**
 * The namespace for `CellModel` statics.
 */
export
namespace CellModel {
  /**
   * The options used to initialize a `CellModel`.
   */
  export interface IOptions {
    /**
     * The source cell data.
     */
    cell?: nbformat.IBaseCell;
  }
}


/**
 * An implementation of a raw cell model.
 */
export
class RawCellModel extends CellModel {
  /**
   * The type of the cell.
   */
  get type(): 'raw' {
    return 'raw';
  }
}


/**
 * An implementation of a markdown cell model.
 */
export
class MarkdownCellModel extends CellModel {
  /**
   * Construct a markdown cell model from optional cell content.
   */
  constructor(options: CellModel.IOptions) {
    super(options);
    // Use the Github-flavored markdown mode.
    this.mimeType = 'text/x-ipythongfm';
  }

  /**
   * The type of the cell.
   */
  get type(): 'markdown' {
    return 'markdown';
  }
}


/**
 * An implementation of a code cell Model.
 */
export
class CodeCellModel extends CellModel implements ICodeCellModel {
  /**
   * Construct a new code cell with optional original cell content.
   */
  constructor(options: CodeCellModel.IOptions) {
    super(options);
    let factory = (options.contentFactory ||
      CodeCellModel.defaultContentFactory
    );
    let trusted = this.trusted;
    this._converter = new CodeCellModel.RealtimeOutputAreaConverter(factory);
    let cell = options.cell as nbformat.ICodeCell;
    let outputs: nbformat.IOutput[] = [];
    if (cell && cell.cell_type === 'code') {
      this.set('executionCount', cell.execution_count);
      outputs = cell.outputs;
    }
    let outputArea = factory.createOutputArea({
      trusted,
      values: outputs
    });
    outputArea.stateChanged.connect(this.onGenericChange, this);
    this.set('outputs', outputArea);
  }

  /**
   * The type of the cell.
   */
  get type(): 'code' {
    return 'code';
  }

  /**
   * The execution count of the cell.
   */
  get executionCount(): nbformat.ExecutionCount {
    return this.get('executionCount') || null;
  }
  set executionCount(newValue: nbformat.ExecutionCount) {
    if (newValue === this.get('executionCount')) {
      return;
    }
    let oldValue = this.executionCount;
    this.set('executionCount', newValue || null);
    this.contentChanged.emit(void 0);
    this.stateChanged.emit({ name: 'executionCount', oldValue, newValue });
  }

  /**
   * The cell outputs.
   */
  get outputs(): IOutputAreaModel {
    return this.get('outputs');
  }

  /**
   * Dispose of the resources held by the model.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    Signal.clearData(this);
    this.get('outputs').dispose();
    this.delete('outputs');
    super.dispose();
  }

  /**
   * Serialize the model to JSON.
   */
  toJSON(): nbformat.ICodeCell {
    let cell = super.toJSON() as nbformat.ICodeCell;
    cell.execution_count = this.get('executionCount') || null;
    cell.outputs = this.get('outputs').toJSON();
    return cell;
  }

  /**
   * Handle a change to the trusted state.
   *
   * The default implementation is a no-op.
   */
  onTrustedChanged(value: boolean): void {
    (this.get('outputs') as any).trusted = value;
  }

  private _converter: IRealtimeConverter<IOutputAreaModel> = null;
}


/**
 * The namespace for `CodeCellModel` statics.
 */
export
namespace CodeCellModel {
  /**
   * The options used to initialize a `CodeCellModel`.
   */
  export interface IOptions {
    /**
     * The source cell data.
     */
    cell?: nbformat.IBaseCell;

    /**
     * The factory for output area model creation.
     */
    contentFactory?: IContentFactory;
  }

  /**
   * A factory for creating code cell model content.
   */
  export
  interface IContentFactory {
    /**
     * Create an output area.
     */
    createOutputArea(options: IOutputAreaModel.IOptions): IOutputAreaModel;
  }

  /**
   * The default implementation of an `IContentFactory`.
   */
  export
  class ContentFactory {
    /**
     * Create an output area.
     */
    createOutputArea(options: IOutputAreaModel.IOptions): IOutputAreaModel {
      return new OutputAreaModel(options);
    }
  }

  export
  class RealtimeOutputAreaConverter implements IRealtimeConverter<IOutputAreaModel> {
    constructor(factory: IContentFactory) {
      this._factory = factory;
    }

    from(value: Synchronizable): IOutputAreaModel {
      let vec = value as any as IObservableVector<nbformat.IOutput>;
      let outputs = this._factory.createOutputArea({});
      for(let i=0; i<outputs.length;i++) {
        outputs.add(vec.at(i));
      }
      return outputs;
    }

    to(value: IOutputAreaModel): Synchronizable {
      return value as any as Synchronizable;
    }
    private _factory: IContentFactory = null;
  }


  /**
   * The shared `ConetntFactory` instance.
   */
  export
  const defaultContentFactory = new ContentFactory();
}
