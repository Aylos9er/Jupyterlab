/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { FieldProps } from '@rjsf/utils';
import { IEditorLanguageRegistry } from '@jupyterlab/codemirror';
import { INotebookTracker, NotebookTools } from '@jupyterlab/notebook';

namespace Private {
  /**
   * Custom active cell field options.
   */
  export interface IOptions {
    /**
     * The tracker to the notebook panel.
     */
    tracker: INotebookTracker;

    /**
     * Editor languages registry
     */
    languages: IEditorLanguageRegistry;
  }
}

/**
 * The active cell field.
 *
 * ## Note
 * This field does not work as other metadata form fields, as it does not use RJSF to update metadata.
 * It extends the MetadataEditorTool which updates itself the metadata.
 * It only renders the node of MetadataEditorTool in a React element instead of displaying a RJSF field.
 */
export class ActiveCellTool extends NotebookTools.ActiveCellTool {
  constructor(options: Private.IOptions) {
    super(options.languages);
    this._tracker = options.tracker;
  }

  render(props: FieldProps): JSX.Element {
    const activeCell = this._tracker.activeCell;
    if (activeCell) this._cellModel = activeCell?.model || null;
    this.refresh()
      .then(() => undefined)
      .catch(() => undefined);
    return (
      <div className="cell-tool">
        <div ref={ref => ref?.appendChild(this.node)}></div>
      </div>
    );
  }

  private _tracker: INotebookTracker;
}
