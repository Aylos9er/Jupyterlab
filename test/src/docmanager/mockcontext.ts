// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IContentsModel, IKernel, ISession
} from 'jupyter-js-services';

import {
  MockKernel, KERNELSPECS
} from 'jupyter-js-services/lib/mockkernel';

import {
  IDisposable
} from 'phosphor-disposable';

import {
  ISignal, Signal
} from 'phosphor-signaling';

import {
  Widget
} from 'phosphor-widget';

import {
  IDocumentContext, IDocumentModel
} from '../../../lib/docregistry';


export
class MockContext<T extends IDocumentModel> implements IDocumentContext<T> {

  constructor(model: T) {
    this._model = model;
  }

  get kernelChanged(): ISignal<IDocumentContext<IDocumentModel>, IKernel> {
    return Private.kernelChangedSignal.bind(this);
  }

  get pathChanged(): ISignal<IDocumentContext<IDocumentModel>, string> {
    return Private.pathChangedSignal.bind(this);
  }

  get dirtyCleared(): ISignal<IDocumentContext<IDocumentModel>, void> {
    return Private.dirtyClearedSignal.bind(this);
  }

  get id(): string {
    return '';
  }

  get model(): T {
    return this._model;
  }

  get kernel(): IKernel {
    return this._kernel;
  }

  get path(): string {
    return this._path;
  }

  get contentsModel(): IContentsModel {
    return void 0;
  }

  get kernelspecs(): IKernel.ISpecModels {
    return KERNELSPECS;
  }

  get isDisposed(): boolean {
    return this._model === null;
  }

  dispose(): void {
    this._model.dispose();
    this._model = null;
  }

  changeKernel(options: IKernel.IModel): Promise<IKernel> {
    this._kernel = new MockKernel(options);
    this.kernelChanged.emit(this._kernel);
    return Promise.resolve(this._kernel);
  }

  save(): Promise<void> {
    return Promise.resolve(void 0);
  }

  saveAs(path: string): Promise<void> {
    this._path = path;
    this.pathChanged.emit(path);
    return Promise.resolve(void 0);
  }

  revert(): Promise<void> {
    return Promise.resolve(void 0);
  }

  listSessions(): Promise<ISession.IModel[]> {
    return Promise.resolve([] as ISession.IModel[]);
  }

  addSibling(widget: Widget): IDisposable {
    return void 0;
  }

  private _model: T = null;
  private _path = '';
  private _kernel: IKernel = null;
}


/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * A signal emitted when the kernel changes.
   */
  export
  const kernelChangedSignal = new Signal<IDocumentContext<IDocumentModel>, IKernel>();

  /**
   * A signal emitted when the path changes.
   */
  export
  const pathChangedSignal = new Signal<IDocumentContext<IDocumentModel>, string>();

  /**
   * A signal emitted when the model is saved or reverted.
   */
  export
  const dirtyClearedSignal = new Signal<IDocumentContext<IDocumentModel>, void>();
}
