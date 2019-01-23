// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { URLExt } from '@jupyterlab/coreutils';

import { ArrayExt, each, find } from '@phosphor/algorithm';

import { ISignal, Signal } from '@phosphor/signaling';

import { Kernel } from '../kernel';

import { ServerConnection } from '..';

import { Session } from './session';

import * as validate from './validate';

/**
 * The url for the session service.
 */
const SESSION_SERVICE_URL = 'api/sessions';

/**
 * Session object for accessing the session REST api. The session
 * should be used to start kernels and then shut them down -- for
 * all other operations, the kernel object should be used.
 */
export class DefaultSession implements Session.ISession {
  /**
   * Construct a new session.
   */
  constructor(options: Session.IOptions, id: string, kernel: Kernel.IKernel) {
    this._id = id;
    this._path = options.path;
    this._type = options.type || 'file';
    this._name = options.name || '';
    this.serverSettings =
      options.serverSettings || ServerConnection.makeSettings();
    Private.addRunning(this);
  }

  /**
   * A signal emitted when the session is shut down.
   *
   * TODO: this is *actually* emitted when a session is disposed. I think there
   * should be a difference between being disposed (i.e., the browser-side
   * object is no longer usable) and terminated (i.e., the server-side session
   * is gone). Termination should lead to disposal, but not necessarily the
   * other way around?
   */
  get terminated(): ISignal<this, void> {
    return this._terminated;
  }

  /**
   * A signal emitted when the kernel changes.
   */
  get kernelChanged(): ISignal<this, Session.IKernelChangedArgs> {
    return this._kernelChanged;
  }

  /**
   * A signal emitted when a session property changes.
   */
  get propertyChanged(): ISignal<this, Session.IProperty> {
    return this._propertyChanged;
  }

  /**
   * Get the session id.
   */
  get id(): string {
    return this._id;
  }

  /**
   * The current kernel of the session.
   *
   * #### Notes
   * This is a read-only property, and can be altered by [changeKernel].
   *
   * We provide an IKernelConnection (instead of an IKernel) so that the user
   * goes through us to shut down the kernel.
   *
   * TODO: delete: We used to proxy the IKernel signals, so that a kernel can
   * change, and the user doesn't have to disconnect and reconnect their signals
   * - we will automatically reconnect the session signals as appropriate as the
   * kernel changes.
   */
  get kernel(): Kernel.IKernelConnection | null {
    return this._kernel;
  }

  /**
   * The current path of the session.
   */
  get path(): string {
    return this._path;
  }

  /**
   * The type of the client session.
   */
  get type(): string {
    return this._type;
  }

  /**
   * The current name of the session.
   */
  get name(): string {
    return this._name;
  }

  /**
   * Get the model associated with the session.
   */
  get model(): Session.IModel {
    return {
      id: this.id,
      kernel: this.kernel.model,
      path: this._path,
      type: this._type,
      name: this._name
    };
  }

  /**
   * The server settings of the session.
   */
  readonly serverSettings: ServerConnection.ISettings;

  /**
   * Clone the current session with a new clientId.
   */
  clone(): Session.ISession {
    const kernel = Kernel.connectTo(this.kernel.model, this.serverSettings);
    return new DefaultSession(
      {
        path: this._path,
        name: this._name,
        type: this._type,
        serverSettings: this.serverSettings
      },
      this._id,
      kernel
    );
  }

  /**
   * Update the session based on a session model from the server.
   */
  update(model: Session.IModel): void {
    // Avoid a race condition if we are waiting for a REST call return.
    if (this._updating) {
      return;
    }
    const oldModel = this.model;
    this._path = model.path;
    this._name = model.name;
    this._type = model.type;

    if (oldModel.name !== this._name) {
      this._propertyChanged.emit('name');
    }
    if (oldModel.type !== this._type) {
      this._propertyChanged.emit('type');
    }
    if (oldModel.path !== this._path) {
      this._propertyChanged.emit('path');
    }

    if (this._kernel.isDisposed || model.kernel.id !== this._kernel.id) {
      const oldValue = this._kernel;
      this._kernel = Kernel.connectTo(model.kernel, this.serverSettings);
      this._kernelChanged.emit({ oldValue, newValue: this._kernel });
    }
  }

  /**
   * Test whether the session is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose of the resources held by the session and terminate the kernel.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._kernel.dispose();
    this._terminated.emit(void 0);
    Private.removeRunning(this);
    Signal.clearData(this);
  }

  /**
   * Change the session model properties (path, name, type).
   *
   * @param props - The new session properties.
   *
   * @returns A promise that resolves when the session has been updated.
   *
   * #### Notes
   * This uses the Jupyter REST API, and the response is validated.
   * The promise is fulfilled on a valid response and rejected otherwise.
   */
  async setProperties({
    path,
    name,
    type
  }: Partial<Record<Session.IProperty, string>>): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Session is disposed');
    }
    if (this._path === path) {
      path = undefined;
    }
    if (this._name === name) {
      name = undefined;
    }
    if (this._type === type) {
      type = undefined;
    }
    const data = JSON.stringify({ path, name, type });
    await this._patch(data);
  }

  /**
   * Change the current kernel associated with the document.
   *
   * @params options - The name or id of the new kernel.
   *
   * #### Notes
   * This shuts down the existing kernel and creates a new kernel,
   * keeping the existing session ID and session path.
   */
  async changeKernel(
    options: Partial<Kernel.IModel>
  ): Promise<Kernel.IKernelConnection> {
    if (this.isDisposed) {
      throw new Error('Session is disposed');
    }
    this._kernel.dispose();
    const data = JSON.stringify({ kernel: options });
    // TODO: set kernel to null?
    await this._patch(data);
    return this.kernel;
  }

  /**
   * Kill the kernel and shutdown the session.
   *
   * @returns - The promise fulfilled on a valid response from the server.
   *
   * #### Notes
   * Uses the [Jupyter Notebook API](http://petstore.swagger.io/?url=https://raw.githubusercontent.com/jupyter/notebook/master/notebook/services/api/api.yaml#!/sessions), and validates the response.
   * Disposes of the session and emits a [sessionDied] signal on success.
   */
  async shutdown(): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Session is disposed');
    }
    await Private.shutdownSession(this.id, this.serverSettings);
  }

  /**
   * Send a PATCH to the server, updating the session path or the kernel.
   */
  private async _patch(body: string): Promise<Session.IModel> {
    this._updating = true;
    let settings = this.serverSettings;
    let url = Private.getSessionUrl(settings.baseUrl, this._id);
    let init = {
      method: 'PATCH',
      body
    };
    try {
      const response = await ServerConnection.makeRequest(url, init, settings);
      if (response.status !== 200) {
        throw new ServerConnection.ResponseError(response);
      }
      const data = await response.json();
      const model = validate.validateModel(data);
      return Private.updateFromServer(model, settings.baseUrl);
    } finally {
      this._updating = false;
    }
  }

  private _id = '';
  private _path = '';
  private _name = '';
  private _type = '';
  private _kernel: Kernel.IKernel;
  private _isDisposed = false;
  private _updating = false;
  private _kernelChanged = new Signal<this, Session.IKernelChangedArgs>(this);
  private _propertyChanged = new Signal<this, 'path' | 'name' | 'type'>(this);
  private _terminated = new Signal<this, void>(this);
}

/**
 * The namespace for `DefaultSession` statics.
 */
export namespace DefaultSession {
  /**
   * List the running sessions.
   */
  export function listRunning(
    settings?: ServerConnection.ISettings
  ): Promise<Session.IModel[]> {
    return Private.listRunning(settings);
  }

  /**
   * Start a new session.
   */
  export function startNew(
    options: Session.IOptions
  ): Promise<Session.ISession> {
    return Private.startNew(options);
  }

  /**
   * Find a session by id.
   */
  export function findById(
    id: string,
    settings?: ServerConnection.ISettings
  ): Promise<Session.IModel> {
    return Private.findById(id, settings);
  }

  /**
   * Find a session by path.
   */
  export function findByPath(
    path: string,
    settings?: ServerConnection.ISettings
  ): Promise<Session.IModel> {
    return Private.findByPath(path, settings);
  }

  /**
   * Connect to a running session.
   */
  export function connectTo(
    model: Session.IModel,
    settings?: ServerConnection.ISettings
  ): Session.ISession {
    return Private.connectTo(model, settings);
  }

  /**
   * Shut down a session by id.
   */
  export function shutdown(
    id: string,
    settings?: ServerConnection.ISettings
  ): Promise<void> {
    return Private.shutdownSession(id, settings);
  }

  /**
   * Shut down all sessions.
   *
   * @param settings - The server settings to use.
   *
   * @returns A promise that resolves when all the sessions are shut down.
   */
  export function shutdownAll(
    settings?: ServerConnection.ISettings
  ): Promise<void> {
    return Private.shutdownAll(settings);
  }
}

/**
 * A namespace for session private data.
 */
namespace Private {
  /**
   * The running sessions mapped by base url.
   */
  const runningSessions = new Map<string, DefaultSession[]>();

  /**
   * Add a session to the running sessions.
   */
  export function addRunning(session: DefaultSession): void {
    let running: DefaultSession[] =
      runningSessions.get(session.serverSettings.baseUrl) || [];
    running.push(session);
    runningSessions.set(session.serverSettings.baseUrl, running);
  }

  /**
   * Remove a session from the running sessions.
   */
  export function removeRunning(session: DefaultSession): void {
    let running = runningSessions.get(session.serverSettings.baseUrl);
    if (running) {
      ArrayExt.removeFirstOf(running, session);
    }
  }

  /**
   * Connect to a running session.
   */
  export function connectTo(
    model: Session.IModel,
    settings?: ServerConnection.ISettings
  ): Session.ISession {
    settings = settings || ServerConnection.makeSettings();
    let running = runningSessions.get(settings.baseUrl) || [];
    let session = find(running, value => value.id === model.id);
    if (session) {
      return session.clone();
    }
    return createSession(model, settings);
  }

  /**
   * Create a Session object.
   *
   * @returns - A promise that resolves with a started session.
   */
  export function createSession(
    model: Session.IModel,
    settings?: ServerConnection.ISettings
  ): DefaultSession {
    settings = settings || ServerConnection.makeSettings();
    let kernel = Kernel.connectTo(model.kernel, settings);
    return new DefaultSession(
      {
        path: model.path,
        type: model.type,
        name: model.name,
        serverSettings: settings
      },
      model.id,
      kernel
    );
  }

  /**
   * Find a session by id.
   */
  export function findById(
    id: string,
    settings?: ServerConnection.ISettings
  ): Promise<Session.IModel> {
    settings = settings || ServerConnection.makeSettings();
    let running = runningSessions.get(settings.baseUrl) || [];
    let session = find(running, value => value.id === id);
    if (session) {
      return Promise.resolve(session.model);
    }

    return getSessionModel(id, settings).catch(() => {
      throw new Error(`No running session for id: ${id}`);
    });
  }

  /**
   * Find a session by path.
   */
  export function findByPath(
    path: string,
    settings?: ServerConnection.ISettings
  ): Promise<Session.IModel> {
    settings = settings || ServerConnection.makeSettings();
    let running = runningSessions.get(settings.baseUrl) || [];
    let session = find(running, value => value.path === path);
    if (session) {
      return Promise.resolve(session.model);
    }

    return listRunning(settings).then(models => {
      let model = find(models, value => {
        return value.path === path;
      });
      if (model) {
        return model;
      }
      throw new Error(`No running session for path: ${path}`);
    });
  }

  /**
   * Get a full session model from the server by session id string.
   */
  export function getSessionModel(
    id: string,
    settings?: ServerConnection.ISettings
  ): Promise<Session.IModel> {
    settings = settings || ServerConnection.makeSettings();
    let url = getSessionUrl(settings.baseUrl, id);
    return ServerConnection.makeRequest(url, {}, settings)
      .then(response => {
        if (response.status !== 200) {
          throw new ServerConnection.ResponseError(response);
        }
        return response.json();
      })
      .then(data => {
        const model = validate.validateModel(data);
        return updateFromServer(model, settings!.baseUrl);
      });
  }

  /**
   * Get a session url.
   */
  export function getSessionUrl(baseUrl: string, id: string): string {
    return URLExt.join(baseUrl, SESSION_SERVICE_URL, id);
  }

  /**
   * Kill the sessions by id.
   */
  function killSessions(id: string, baseUrl: string): void {
    let running = runningSessions.get(baseUrl) || [];
    each(running.slice(), session => {
      if (session.id === id) {
        session.dispose();
      }
    });
  }

  /**
   * List the running sessions.
   */
  export function listRunning(
    settings?: ServerConnection.ISettings
  ): Promise<Session.IModel[]> {
    settings = settings || ServerConnection.makeSettings();
    let url = URLExt.join(settings.baseUrl, SESSION_SERVICE_URL);
    return ServerConnection.makeRequest(url, {}, settings)
      .then(response => {
        if (response.status !== 200) {
          throw new ServerConnection.ResponseError(response);
        }
        return response.json();
      })
      .then(data => {
        if (!Array.isArray(data)) {
          throw new Error('Invalid Session list');
        }
        for (let i = 0; i < data.length; i++) {
          data[i] = validate.validateModel(data[i]);
        }
        return updateRunningSessions(data, settings!.baseUrl);
      });
  }

  /**
   * Shut down a session by id.
   */
  export function shutdownSession(
    id: string,
    settings?: ServerConnection.ISettings
  ): Promise<void> {
    settings = settings || ServerConnection.makeSettings();
    let url = getSessionUrl(settings.baseUrl, id);
    let init = { method: 'DELETE' };
    return ServerConnection.makeRequest(url, init, settings).then(response => {
      if (response.status === 404) {
        response.json().then(data => {
          let msg =
            data.message || `The session "${id}"" does not exist on the server`;
          console.warn(msg);
        });
      } else if (response.status === 410) {
        throw new ServerConnection.ResponseError(
          response,
          'The kernel was deleted but the session was not'
        );
      } else if (response.status !== 204) {
        throw new ServerConnection.ResponseError(response);
      }
      killSessions(id, settings!.baseUrl);
    });
  }

  /**
   * Shut down all sessions.
   */
  export function shutdownAll(
    settings?: ServerConnection.ISettings
  ): Promise<void> {
    settings = settings || ServerConnection.makeSettings();
    return listRunning(settings).then(running => {
      each(running, s => {
        shutdownSession(s.id, settings);
      });
    });
  }

  /**
   * Start a new session.
   */
  export function startNew(
    options: Session.IOptions
  ): Promise<Session.ISession> {
    if (options.path === void 0) {
      return Promise.reject(new Error('Must specify a path'));
    }
    return startSession(options).then(model => {
      return createSession(model, options.serverSettings);
    });
  }

  /**
   * Create a new session, or return an existing session if
   * the session path already exists
   */
  export function startSession(
    options: Session.IOptions
  ): Promise<Session.IModel> {
    let settings = options.serverSettings || ServerConnection.makeSettings();
    let model = {
      kernel: { name: options.kernelName, id: options.kernelId },
      path: options.path,
      type: options.type || '',
      name: options.name || ''
    };
    let url = URLExt.join(settings.baseUrl, SESSION_SERVICE_URL);
    let init = {
      method: 'POST',
      body: JSON.stringify(model)
    };
    return ServerConnection.makeRequest(url, init, settings)
      .then(response => {
        if (response.status !== 201) {
          throw new ServerConnection.ResponseError(response);
        }
        return response.json();
      })
      .then(data => {
        const model = validate.validateModel(data);
        return updateFromServer(model, settings.baseUrl);
      });
  }

  /**
   * Update the running sessions given an updated session Id.
   */
  export function updateFromServer(
    model: Session.IModel,
    baseUrl: string
  ): Session.IModel {
    let running = runningSessions.get(baseUrl) || [];
    each(running.slice(), session => {
      if (session.id === model.id) {
        session.update(model);
      }
    });
    return model;
  }

  /**
   * Update the running sessions based on new data from the server.
   */
  export function updateRunningSessions(
    sessions: Session.IModel[],
    baseUrl: string
  ): Session.IModel[] {
    let running = runningSessions.get(baseUrl) || [];
    // Iterate through our existing session models
    each(running.slice(), session => {
      // find a corresponding updated model from the server.
      let updated = find(sessions, s => session.id === s.id);

      // If we find an updated model, update our model.
      if (updated) {
        session.update(updated);
      }

      // If we don't find a corresponding server model, and the kernel status
      // isn't 'dead', dispose the model to keep consistent with the server.

      // TODO: should we also dispose if the kernel status *is* 'dead'? This
      // seems like it would keep the sessions with dead kernels around.
      if (!updated && session.kernel && session.kernel.status !== 'dead') {
        session.dispose();
      }
    });
    return sessions;
  }
}
