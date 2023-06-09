// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Token } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';
import { CodeEditor } from './editor';
import { IEditorFactoryService } from './factory';
import { IEditorMimeTypeService } from './mimetype';

/**
 * Code editor services token.
 */
export const IEditorServices = new Token<IEditorServices>(
  '@jupyterlab/codeeditor:IEditorServices',
  `A service for the text editor provider
  for the application. Use this to create new text editors and host them in your
  UI elements.`
);

/**
 * Code editor services.
 */
export interface IEditorServices {
  /**
   * The code editor factory.
   */
  readonly factoryService: IEditorFactoryService;

  /**
   * The editor mime type service.
   */
  readonly mimeTypeService: IEditorMimeTypeService;
}

/**
 * Code editor cursor position token.
 */
export const IPositionModel = new Token<IPositionModel>(
  '@jupyterlab/codeeditor:IPositionModel',
  `A service to handle an code editor cursor position.`
);

/**
 * Code editor cursor position model.
 */
export interface IPositionModel {
  /**
   * Add a editor provider.
   *
   * A provider will receive the currently active widget and must return the
   * associated editor if it can or null otherwise.
   */
  addEditorProvider: (
    provider: (widget: Widget | null) => Promise<CodeEditor.IEditor | null>
  ) => void;

  /**
   * Callback to force updating the provider
   */
  update(): void;
}
