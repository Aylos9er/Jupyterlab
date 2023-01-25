// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import type { WidgetTracker } from '@jupyterlab/apputils';
import type { IStateDB } from '@jupyterlab/statedb';
import { Token } from '@lumino/coreutils';
import type { FileBrowser } from './browser';

/**
 * The file browser factory token.
 */
export const IFileBrowserFactory = new Token<IFileBrowserFactory>(
  '@jupyterlab/filebrowser:IFileBrowserFactory'
);

/**
 * The default file browser token.
 */
export const IDefaultFileBrowser = new Token<IDefaultFileBrowser>(
  '@jupyterlab/filebrowser:IDefaultFileBrowser'
);

/**
 * Default file browser type.
 */
export type IDefaultFileBrowser = FileBrowser;

/**
 * The file browser factory interface.
 */
export interface IFileBrowserFactory {
  /**
   * Create a new file browser instance.
   *
   * @param id - The widget/DOM id of the file browser.
   *
   * @param options - The optional file browser configuration object.
   *
   * #### Notes
   * The ID parameter is used to set the widget ID. It is also used as part of
   * the unique key necessary to store the file browser's restoration data in
   * the state database if that functionality is enabled.
   *
   * If, after the file browser has been generated by the factory, the ID of the
   * resulting widget is changed by client code, the restoration functionality
   * will not be disrupted as long as there are no ID collisions, i.e., as long
   * as the initial ID passed into the factory is used for only one file browser
   * instance.
   */
  createFileBrowser(
    id: string,
    options?: IFileBrowserFactory.IOptions
  ): FileBrowser;

  /**
   * The widget tracker used by the factory to track file browsers.
   */
  readonly tracker: WidgetTracker<FileBrowser>;
}

/**
 * A namespace for file browser factory interfaces.
 */
export namespace IFileBrowserFactory {
  /**
   * The options for creating a file browser using a file browser factory.
   *
   * #### Notes
   * In future versions of JupyterLab, some of these options may disappear,
   * which is a backward-incompatible API change and will necessitate a new
   * version release. This is because in future versions, there will likely be
   * an application-wide notion of a singleton command registry and a singleton
   * state database.
   */
  export interface IOptions {
    /**
     * Whether a file browser automatically loads its initial path.
     *
     * #### Notes
     * The default is `true`.
     */
    auto?: boolean;

    /**
     * An optional `Contents.IDrive` name for the model.
     * If given, the model will prepend `driveName:` to
     * all paths used in file operations.
     */
    driveName?: string;

    /**
     * The time interval for browser refreshing, in ms.
     */
    refreshInterval?: number;

    /**
     * Whether a file browser automatically restores state when instantiated.
     * The default is `true`.
     *
     * #### Notes
     * The file browser model will need to be restored before for the file
     * browser to start saving its state.
     */
    restore?: boolean;

    /**
     * The state database to use for saving file browser state and restoring it.
     *
     * #### Notes
     * Unless the value `null` is set for this option, the application state
     * database will be automatically passed in and used for state restoration.
     */
    state?: IStateDB | null;
  }
}

/**
 * The token that indicates the default file browser commands are loaded.
 */
export const IFileBrowserCommands = new Token<void>(
  '@jupyterlab/filebrowser:IFileBrowserCommands'
);
