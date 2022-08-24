// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

/* global RequestInit */

import { Dialog, showDialog } from '@jupyterlab/apputils';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { ServerConnection, ServiceManager } from '@jupyterlab/services';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { VDomModel } from '@jupyterlab/ui-components';
import { Debouncer } from '@lumino/polling';
import * as semver from 'semver';
import { reportInstallError } from './dialog';

/**
 * Information about an extension.
 */
export interface IEntry {
  /**
   * The name of the extension.
   */
  name: string;

  /**
   * A short description of the extension.
   */
  description: string;

  /**
   * A representative link of the package.
   */
  url: string;

  /**
   * Whether the extension is currently installed.
   */
  installed?: boolean | null;

  /**
   * Whether the extension is allowed or not.
   */
  is_allowed: boolean;

  /**
   * Whether the extension is currently enabled.
   */
  enabled: boolean;

  /**
   * The latest version of the extension.
   */
  latest_version: string;

  /**
   * The installed version of the extension.
   */
  installed_version: string;

  /**
   * A flag indicating the status of an installed extension.
   */
  status: 'ok' | 'warning' | 'error' | 'deprecated' | null;

  /**
   * The package type (prebuilt or source).
   */
  pkg_type: 'prebuilt' | 'source';

  /**
   * The information about extension installation.
   */
  install?: IInstall | null;
}

/**
 * Information about extension installation.
 */
export interface IInstall {
  /**
   * The used package manager (e.g. pip, conda...)
   */
  packageManager: string | undefined;

  /**
   * The package name as known by the package manager.
   */
  packageName: string | undefined;

  /**
   * The uninstallation instructions as a comprehensive
   * text for the end user.
   */
  uninstallInstructions: string | undefined;
}

/**
 * An object representing a server reply to performing an action.
 */
export interface IActionReply {
  /**
   * The status category of the reply.
   */
  status: 'ok' | 'warning' | 'error' | null;

  /**
   * An optional message when the status is not 'ok'.
   */
  message?: string;

  /**
   * Follow-up restart needed by the action
   */
  needs_restart: ('frontend' | 'kernel' | 'server')[];
}

/**
 * The server API path for querying/modifying installed extensions.
 */
const EXTENSION_API_PATH = 'lab/api/extensions';

/**
 * Extension actions that the server API accepts
 */
export type Action = 'install' | 'uninstall' | 'enable' | 'disable';

/**
 * Model for an extension list.
 */
export class ListModel extends VDomModel {
  constructor(
    serviceManager: ServiceManager.IManager,
    translator?: ITranslator
  ) {
    super();

    this.canInstall =
      PageConfig.getOption('extensionsManagerCanInstall').toLowerCase() ===
      'true';
    this.translator = translator || nullTranslator;
    this._installed = [];
    this._lastSearchResult = [];
    this.serviceManager = serviceManager;
    this._debouncedSearch = new Debouncer(this.search.bind(this), 1000);
  }

  /**
   * Whether the extension manager support installation methods or not.
   */
  readonly canInstall: boolean;

  /**
   * A readonly array of the installed extensions.
   */
  get installed(): ReadonlyArray<IEntry> {
    return this._installed;
  }

  /**
   * Whether the warning is disclaimed or not.
   */
  get isDisclaimed(): boolean {
    return this._isDisclaimed;
  }
  set isDisclaimed(v: boolean) {
    if (v !== this._isDisclaimed) {
      this._isDisclaimed = v;
      this.stateChanged.emit();
      void this._debouncedSearch.invoke();
    }
  }

  get isLoadingInstalledExtensions(): boolean {
    return this._isLoadingInstalledExtensions;
  }

  get isSearching(): boolean {
    return this._isSearching;
  }

  /**
   * A readonly array containing the latest search result
   */
  get searchResult(): ReadonlyArray<IEntry> {
    return this._lastSearchResult;
  }

  /**
   * The search query.
   *
   * Setting its value triggers a new search.
   */
  get query(): string {
    return this._query;
  }
  set query(value: string) {
    if (this._query !== value) {
      this._query = value;
      void this._debouncedSearch.invoke();
    }
  }

  /**
   * The current search page.
   *
   * Setting its value triggers a new search.
   */
  get page(): number {
    return this._page;
  }
  set page(value: number) {
    if (this._page !== value) {
      this._page = value;
      void this._debouncedSearch.invoke();
    }
  }

  /**
   * The search pagination.
   *
   * Setting its value triggers a new search.
   */
  get pagination(): number {
    return this._pagination;
  }
  set pagination(value: number) {
    if (this._pagination !== value) {
      this._pagination = value;
      void this._debouncedSearch.invoke();
    }
  }

  /**
   * The total number of results in the current search.
   */
  get totalEntries(): number {
    return this._totalEntries;
  }

  /**
   * Dispose the extensions list model.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._debouncedSearch.dispose();
    super.dispose();
  }

  /**
   * Whether there are currently any actions pending.
   */
  hasPendingActions(): boolean {
    return this._pendingActions.length > 0;
  }

  /**
   * Install an extension.
   *
   * @param entry An entry indicating which extension to install.
   */
  async install(entry: IEntry): Promise<void> {
    await this.performAction('install', entry).then(data => {
      if (data.status !== 'ok') {
        reportInstallError(entry.name, data.message, this.translator);
      }
      return this.update(true);
    });
  }

  /**
   * Uninstall an extension.
   *
   * @param entry An entry indicating which extension to uninstall.
   */
  async uninstall(entry: IEntry): Promise<void> {
    if (!entry.installed) {
      throw new Error(`Not installed, cannot uninstall: ${entry.name}`);
    }
    await this.performAction('uninstall', entry);
    return this.update(true);
  }

  /**
   * Enable an extension.
   *
   * @param entry An entry indicating which extension to enable.
   */
  async enable(entry: IEntry): Promise<void> {
    if (entry.enabled) {
      throw new Error(`Already enabled: ${entry.name}`);
    }
    await this.performAction('enable', entry);
    await this.refreshInstalled(true);
  }

  /**
   * Disable an extension.
   *
   * @param entry An entry indicating which extension to disable.
   */
  async disable(entry: IEntry): Promise<void> {
    if (!entry.enabled) {
      throw new Error(`Already disabled: ${entry.name}`);
    }
    await this.performAction('disable', entry);
    await this.refreshInstalled(true);
  }

  /**
   * Refresh installed packages
   *
   * @param force Force refreshing the list of installed packages
   */
  async refreshInstalled(force = false): Promise<void> {
    this.installedError = null;
    this._isLoadingInstalledExtensions = true;
    this.stateChanged.emit();
    try {
      const extensions = await Private.requestAPI<IEntry[]>({
        refresh: force ? 1 : 0
      });
      this._installed = extensions.sort(Private.comparator);
    } catch (reason) {
      this.installedError = reason.toString();
    } finally {
      this._isLoadingInstalledExtensions = false;
      this.stateChanged.emit();
    }
  }

  /**
   * Search with current query.
   *
   * Sets searchError and totalEntries as appropriate.
   *
   * @returns The extensions matching the current query.
   */
  protected async search(force = false): Promise<void> {
    if (!this.isDisclaimed) {
      return Promise.reject('Installation warning is not disclaimed.');
    }

    this.searchError = null;
    this._isSearching = true;
    this.stateChanged.emit();
    try {
      const extensions = await Private.requestAPI<IEntry[]>({
        query: this.query ?? '',
        page: this.page,
        per_page: this.pagination,
        refresh: force ? 1 : 0
      });

      this._totalEntries = extensions.length;

      const installedNames = this._installed.map(pkg => pkg.name);
      this._lastSearchResult = extensions
        .filter(pkg => !installedNames.includes(pkg.name))
        .sort(Private.comparator);
    } catch (reason) {
      this.searchError = reason.toString();
    } finally {
      this._isSearching = false;
      this.stateChanged.emit();
    }
  }

  /**
   * Update the current model.
   *
   * This will query the packages repository, and the notebook server.
   *
   * Emits the `stateChanged` signal on successful completion.
   */
  protected async update(force = false): Promise<void> {
    if (this.isDisclaimed) {
      // First refresh the installed list - so the search results are correctly filtered
      await this.refreshInstalled(force);
      await this.search();
    }
  }

  /**
   * Send a request to the server to perform an action on an extension.
   *
   * @param action A valid action to perform.
   * @param entry The extension to perform the action on.
   */
  protected performAction(
    action: string,
    entry: IEntry
  ): Promise<IActionReply> {
    const actionRequest = Private.requestAPI<IActionReply>(
      {},
      {
        method: 'POST',
        body: JSON.stringify({
          cmd: action,
          extension_name: entry.name
        })
      }
    );

    actionRequest.then(
      reply => {
        const trans = this.translator.load('jupyterlab');
        if (reply.needs_restart.includes('server')) {
          void showDialog({
            title: trans.__('Information'),
            body: trans.__(
              'You will need to restart JupyterLab to apply the changes.'
            ),
            buttons: [Dialog.okButton({ label: trans.__('Ok') })]
          });
        } else {
          const followUps: string[] = [];
          if (reply.needs_restart.includes('frontend')) {
            followUps.push(trans.__('refresh the web page'));
          }
          if (reply.needs_restart.includes('kernel')) {
            followUps.push(
              trans.__('install the extension in all kernels and restart them')
            );
          }
          void showDialog({
            title: trans.__('Information'),
            body: trans.__(
              'You will need to %1 to apply the changes.',
              followUps.join(trans.__(' and '))
            ),
            buttons: [Dialog.okButton({ label: trans.__('Ok') })]
          });
        }
        this.actionError = null;
      },
      reason => {
        this.actionError = reason.toString();
      }
    );
    this.addPendingAction(actionRequest);
    return actionRequest;
  }

  /**
   * Add a pending action.
   *
   * @param pending A promise that resolves when the action is completed.
   */
  protected addPendingAction(pending: Promise<any>): void {
    // Add to pending actions collection
    this._pendingActions.push(pending);

    // Ensure action is removed when resolved
    const remove = () => {
      const i = this._pendingActions.indexOf(pending);
      this._pendingActions.splice(i, 1);
      this.stateChanged.emit(undefined);
    };
    pending.then(remove, remove);

    // Signal changed state
    this.stateChanged.emit(undefined);
  }

  actionError: string | null = null;

  /**
   * Contains an error message if an error occurred when querying installed extensions.
   */
  installedError: string | null = null;

  /**
   * Contains an error message if an error occurred when searching for extensions.
   */
  searchError: string | null = null;

  /**
   * Whether a reload should be considered due to actions taken.
   */
  promptReload = false;

  /**
   * The service manager to use for building.
   */
  protected serviceManager: ServiceManager.IManager;

  protected translator: ITranslator;

  private _isDisclaimed = false;
  private _isLoadingInstalledExtensions = false;
  private _isSearching = false;

  private _query: string = '';
  private _page: number = 0;
  private _pagination: number = 250;
  private _totalEntries: number = 0;

  private _installed: IEntry[];
  private _lastSearchResult: IEntry[];
  private _pendingActions: Promise<any>[] = [];
  private _debouncedSearch: Debouncer<void, void>;
}

/**
 * ListModel statics.
 */
export namespace ListModel {
  /**
   * Utility function to check whether an entry can be updated.
   *
   * @param entry The entry to check.
   */
  export function entryHasUpdate(entry: IEntry): boolean {
    if (!entry.installed || !entry.latest_version) {
      return false;
    }
    return semver.lt(entry.installed_version, entry.latest_version);
  }
}

/**
 * A namespace for private functionality.
 */
namespace Private {
  /**
   * A comparator function that sorts allowedExtensions orgs to the top.
   */
  export function comparator(a: IEntry, b: IEntry): number {
    if (a.name === b.name) {
      return 0;
    } else {
      return a.name > b.name ? 1 : -1;
    }
  }

  /**
   * Call the API extension
   *
   * @param queryArgs Query arguments
   * @param init Initial values for the request
   * @returns The response body interpreted as JSON
   */
  export async function requestAPI<T>(
    queryArgs: { [k: string]: any } = {},
    init: RequestInit = {}
  ): Promise<T> {
    // Make request to Jupyter API
    const settings = ServerConnection.makeSettings();
    const requestUrl = URLExt.join(
      settings.baseUrl,
      EXTENSION_API_PATH // API Namespace
    );

    let response: Response;
    try {
      response = await ServerConnection.makeRequest(
        requestUrl + URLExt.objectToQueryString(queryArgs),
        init,
        settings
      );
    } catch (error) {
      throw new ServerConnection.NetworkError(error);
    }

    let data: any = await response.text();

    if (data.length > 0) {
      try {
        data = JSON.parse(data);
      } catch (error) {
        console.log('Not a JSON response body.', response);
      }
    }

    if (!response.ok) {
      throw new ServerConnection.ResponseError(response, data.message || data);
    }

    return data;
  }
}
