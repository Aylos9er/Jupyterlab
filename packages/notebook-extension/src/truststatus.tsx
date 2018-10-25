/**
 * Default item to display if a cell is trusted in the notebook.
 */
/**
 * Part of Jupyterlab status bar defaults.
 */
import React from 'react';

import { JupyterLabPlugin, JupyterLab } from '@jupyterlab/application';

import { VDomRenderer, VDomModel } from '@jupyterlab/apputils';

import {
  INotebookTracker,
  NotebookPanel,
  INotebookModel,
  Notebook
} from '@jupyterlab/notebook';

import { Cell } from '@jupyterlab/cells';

import { IconItem, IStatusBar } from '@jupyterlab/statusbar';

import { toArray } from '@phosphor/algorithm';

import { IDisposable } from '@phosphor/disposable';

import { ISignal } from '@phosphor/signaling';

export const cellStatus = (
  prop: NotebookTrustComponent.IProps | NotebookTrust.Model
) => {
  if (prop.trustedCells === prop.totalCells) {
    return [
      `Notebook trusted: ${prop.trustedCells} of ${
        prop.totalCells
      } cells trusted.`,
      'trusted-item'
    ];
  } else if (prop.activeCellTrusted) {
    return [
      `Active cell trusted: ${prop.trustedCells} of ${
        prop.totalCells
      } cells trusted. `,
      'trusted-item'
    ];
  } else {
    return [
      `Notebook not trusted: ${prop.trustedCells} of ${
        prop.totalCells
      } cells trusted.`,
      'not-trusted-item'
    ];
  }
};
// tslint:disable-next-line:variable-name
const NotebookTrustComponent = (
  props: NotebookTrustComponent.IProps
): React.ReactElement<NotebookTrustComponent.IProps> => {
  let source: string;

  source = cellStatus(props)[1];

  return <IconItem source={source} offset={{ x: 0, y: 2 }} />;
};

namespace NotebookTrustComponent {
  export interface IProps {
    allCellsTrusted: boolean;
    activeCellTrusted: boolean;
    totalCells: number;
    trustedCells: number;
  }
}

class NotebookTrust extends VDomRenderer<NotebookTrust.Model>
  implements INotebookTrust {
  constructor(opts: NotebookTrust.IOptions) {
    super();
    this._tracker = opts.tracker;

    this._tracker.currentChanged.connect(this._onNotebookChange);
    this.model = new NotebookTrust.Model(
      this._tracker.currentWidget && this._tracker.currentWidget.content
    );

    this.node.title = cellStatus(this.model)[0];
  }

  private _onNotebookChange = (
    tracker: INotebookTracker,
    notebook: NotebookPanel | null
  ) => {
    if (notebook === null) {
      this.model!.notebook = null;
    } else {
      this.model!.notebook = notebook.content;
    }
  };

  render() {
    if (this.model === null) {
      return null;
    } else {
      this.node.title = cellStatus(this.model)[0];
      return (
        <div>
          <NotebookTrustComponent
            allCellsTrusted={this.model.trustedCells === this.model.totalCells}
            activeCellTrusted={this.model.activeCellTrusted}
            totalCells={this.model.totalCells}
            trustedCells={this.model.trustedCells}
          />
        </div>
      );
    }
  }

  dispose() {
    super.dispose();

    this._tracker.currentChanged.disconnect(this._onNotebookChange);
  }

  private _tracker: INotebookTracker;
}

namespace NotebookTrust {
  export class Model extends VDomModel implements INotebookTrust.IModel {
    constructor(notebook: Notebook | null) {
      super();

      this.notebook = notebook;
    }

    get trustedCells() {
      return this._trustedCells;
    }

    get totalCells() {
      return this._totalCells;
    }

    get activeCellTrusted() {
      return this._activeCellTrusted;
    }

    get notebook() {
      return this._notebook;
    }

    set notebook(model: Notebook | null) {
      const oldNotebook = this._notebook;
      if (oldNotebook !== null) {
        oldNotebook.activeCellChanged.disconnect(this._onActiveCellChanged);

        oldNotebook.modelContentChanged.disconnect(this._onModelChanged);
      }

      const oldState = this._getAllState();
      this._notebook = model;
      if (this._notebook === null) {
        this._trustedCells = 0;
        this._totalCells = 0;
        this._activeCellTrusted = false;
      } else {
        // Add listeners
        this._notebook.activeCellChanged.connect(this._onActiveCellChanged);

        this._notebook.modelContentChanged.connect(this._onModelChanged);

        // Derive values
        if (this._notebook!.activeCell !== undefined) {
          this._activeCellTrusted = this._notebook!.activeCell!.model.trusted;
        } else {
          this._activeCellTrusted = false;
        }

        const { total, trusted } = this._deriveCellTrustState(
          this._notebook.model
        );

        this._totalCells = total;
        this._trustedCells = trusted;
      }

      this._triggerChange(oldState, this._getAllState());
    }

    private _onModelChanged = (notebook: Notebook) => {
      const oldState = this._getAllState();
      const { total, trusted } = this._deriveCellTrustState(notebook.model);

      this._totalCells = total;
      this._trustedCells = trusted;
      this._triggerChange(oldState, this._getAllState());
    };

    private _onActiveCellChanged = (model: Notebook, cell: Cell | null) => {
      const oldState = this._getAllState();
      if (cell !== null && cell !== undefined) {
        this._activeCellTrusted = cell.model.trusted;
      } else {
        this._activeCellTrusted = false;
      }

      this._triggerChange(oldState, this._getAllState());
    };

    private _deriveCellTrustState(
      model: INotebookModel
    ): { total: number; trusted: number } {
      let cells = toArray(model.cells);

      let trusted = cells.reduce((accum, current) => {
        if (current.trusted) {
          return accum + 1;
        } else {
          return accum;
        }
      }, 0);

      let total = cells.length;

      return {
        total,
        trusted
      };
    }

    private _getAllState(): [number, number, boolean] {
      return [this._trustedCells, this._totalCells, this.activeCellTrusted];
    }

    private _triggerChange(
      oldState: [number, number, boolean],
      newState: [number, number, boolean]
    ) {
      if (
        oldState[0] !== newState[0] ||
        oldState[1] !== newState[1] ||
        oldState[2] !== newState[2]
      ) {
        this.stateChanged.emit(void 0);
      }
    }

    private _trustedCells: number = 0;
    private _totalCells: number = 0;
    private _activeCellTrusted: boolean = false;
    private _notebook: Notebook | null = null;
  }

  export interface IOptions {
    tracker: INotebookTracker;
  }
}

export interface INotebookTrust extends IDisposable {
  readonly model: INotebookTrust.IModel | null;
  readonly modelChanged: ISignal<this, void>;
}

export namespace INotebookTrust {
  export interface IModel {
    readonly trustedCells: number;
    readonly totalCells: number;
    readonly activeCellTrusted: boolean;

    readonly notebook: Notebook | null;
  }
}

export const notebookTrustItem: JupyterLabPlugin<void> = {
  id: '@jupyterlab/notebook-extension:trust-status',
  autoStart: true,
  requires: [IStatusBar, INotebookTracker],
  activate: (
    app: JupyterLab,
    statusBar: IStatusBar,
    tracker: INotebookTracker
  ) => {
    const item = new NotebookTrust({ tracker });

    statusBar.registerStatusItem('notebook-trust-item', item, {
      align: 'right',
      rank: 3,
      isActive: () =>
        app.shell.currentWidget &&
        tracker.currentWidget &&
        app.shell.currentWidget === tracker.currentWidget
    });
  }
};
