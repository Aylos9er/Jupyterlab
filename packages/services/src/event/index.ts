// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { URLExt } from '@jupyterlab/coreutils';
import { PromiseDelegate } from '@lumino/coreutils';
import { IDisposable } from '@lumino/disposable';
import { ISignal, Signal } from '@lumino/signaling';
import { ServerConnection } from '../serverconnection';

/**
 * The url for the jupyter-server events service.
 */
const SERVICE_EVENTS_URL = 'api/events';

/**
 * The events API service manager.
 */
export class EventManager implements IDisposable {
  /**
   * Create a new event manager.
   */
  constructor(options: EventManager.IOptions = {}) {
    this.serverSettings =
      options.serverSettings ?? ServerConnection.makeSettings();
    this._stream = new Private.Stream(this);
    this._connect();
  }

  /**
   * The server settings used to make API requests.
   */
  readonly serverSettings: ServerConnection.ISettings;

  /**
   * Whether the event manager is disposed.
   */
  get isDisposed(): boolean {
    return this._socket === null;
  }

  /**
   * An event stream that emits and yields each new event.
   */
  get stream(): Event.Stream {
    return this._stream;
  }

  /**
   * Dispose the event manager.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    const socket = this._socket;
    this._socket = null;
    socket!.onopen = () => undefined;
    socket!.onerror = () => undefined;
    socket!.onmessage = () => undefined;
    socket!.onclose = () => undefined;
    socket!.close();

    Signal.clearData(this);
  }

  /**
   * Emit an event to be broadcast by the application event bus.
   */
  async emit(event: Event): Promise<void> {
    const { serverSettings } = this;
    const { baseUrl, token } = serverSettings;
    const { makeRequest, ResponseError } = ServerConnection;
    const url =
      URLExt.join(baseUrl, SERVICE_EVENTS_URL) +
      (token ? `?token=${token}` : '');
    const init = { body: JSON.stringify(event), method: 'POST' };
    const response = await makeRequest(url, init, serverSettings);

    if (response.status !== 204) {
      throw new ResponseError(response);
    }
  }

  /**
   * Open the WebSocket to the server.
   */
  private _connect(): void {
    const { token, WebSocket, wsUrl } = this.serverSettings;
    const url =
      URLExt.join(wsUrl, SERVICE_EVENTS_URL, 'subscribe') +
      (token ? `?token=${encodeURIComponent(token)}` : '');
    const socket = (this._socket = new WebSocket(url));
    const stream = this._stream;

    socket.onclose = () => this._connect();
    socket.onmessage = msg => msg.data && stream.emit(JSON.parse(msg.data));
  }

  private _socket: WebSocket | null = null;
  private _stream: Private.Stream;
}

/**
 * A namespace for `EventManager` statics.
 */
export namespace EventManager {
  /**
   * The instantiation options for an event manager.
   */
  export interface IOptions {
    /**
     * The server settings used to make API requests.
     */
    serverSettings?: ServerConnection.ISettings;
  }
}

/**
 * A namespace for event API interfaces.
 */
export namespace Event {
  /**
   * The event emission type.
   */
  export type Emission = { schema_id: string };

  /**
   * An event stream with the characteristics of a signal and an async iterator.
   */
  export type Stream = AsyncIterableIterator<Emission> &
    ISignal<IManager, Emission>;

  /**
   * The interface for the event bus front-end.
   */
  export interface IManager extends EventManager {}
}

/**
 * A namespace for private module data.
 */
namespace Private {
  /**
   * A stream with the characteristics of a signal and an async iterator.
   */
  export class Stream
    extends Signal<EventManager, Event.Emission>
    implements AsyncIterableIterator<Event.Emission>
  {
    async *[Symbol.asyncIterator](): AsyncIterableIterator<Event.Emission> {
      while (this.pending) {
        yield this.pending.promise;
      }
    }

    emit(event: Event.Emission): void {
      super.emit(event);
      const { pending } = this;
      this.pending = new PromiseDelegate();
      pending.resolve(event);
    }

    async next(): Promise<IteratorResult<Event.Emission>> {
      return { value: await this.pending.promise };
    }

    protected pending = new PromiseDelegate<Event.Emission>();
  }
}
