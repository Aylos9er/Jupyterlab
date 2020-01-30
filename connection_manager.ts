import { VirtualDocument, IForeignContext } from './virtual/document';
import { LSPConnection } from './connection';

import { Signal } from '@phosphor/signaling';
import { PageConfig, URLExt } from '@jupyterlab/coreutils';
import { sleep, until_ready } from './utils';

// Name-only import so as to not trigger inclusion in main bundle
import * as ConnectionModuleType from './connection';

const DEBUG = 0;

export interface IDocumentConnectionData {
  virtual_document: VirtualDocument;
  connection: LSPConnection;
}

interface ISocketConnectionOptions {
  virtual_document: VirtualDocument;
  /**
   * The language identifier, corresponding to the API endpoint on the LSP proxy server.
   */
  language: string;
  /**
   * The root path in the JupyterLab (virtual) path space
   */
  root_path: string;
  /**
   * Path to the document in the JupyterLab space
   */
  document_path: string;
}

/**
 * Each Widget with a document (whether file or a notebook) has its own DocumentConnectionManager
 * (see JupyterLabWidgetAdapter), keeping the virtual document spaces separate if a file is opened twice.
 */
export class DocumentConnectionManager {
  connections: Map<VirtualDocument.id_path, LSPConnection>;
  documents: Map<VirtualDocument.id_path, VirtualDocument>;
  initialized: Signal<DocumentConnectionManager, IDocumentConnectionData>;
  connected: Signal<DocumentConnectionManager, IDocumentConnectionData>;
  /**
   * Connection temporarily lost or could not be fully established; a re-connection will be attempted;
   */
  disconnected: Signal<DocumentConnectionManager, IDocumentConnectionData>;
  /**
   * Connection was closed permanently and no-reconnection will be attempted, e.g.:
   *  - there was a serious server error
   *  - user closed the connection,
   *  - re-connection attempts exceeded,
   */
  closed: Signal<DocumentConnectionManager, IDocumentConnectionData>;
  documents_changed: Signal<
    DocumentConnectionManager,
    Map<VirtualDocument.id_path, VirtualDocument>
  >;
  private ignored_languages: Set<string>;

  constructor() {
    this.connections = new Map();
    this.documents = new Map();
    this.ignored_languages = new Set();
    this.connected = new Signal(this);
    this.initialized = new Signal(this);
    this.disconnected = new Signal(this);
    this.closed = new Signal(this);
    this.documents_changed = new Signal(this);
  }

  connect_document_signals(virtual_document: VirtualDocument) {
    virtual_document.foreign_document_opened.connect(
      this.on_foreign_document_opened,
      this
    );

    virtual_document.foreign_document_closed.connect(
      this.on_foreign_document_closed,
      this
    );

    this.documents.set(virtual_document.id_path, virtual_document);
    this.documents_changed.emit(this.documents);
  }

  disconnect_document_signals(virtual_document: VirtualDocument, emit = true) {
    virtual_document.foreign_document_opened.disconnect(
      this.on_foreign_document_opened,
      this
    );

    virtual_document.foreign_document_closed.disconnect(
      this.on_foreign_document_closed,
      this
    );

    this.documents.delete(virtual_document.id_path);
    for (const foreign of virtual_document.foreign_documents.values()) {
      this.disconnect_document_signals(foreign, false);
    }

    if (emit) {
      this.documents_changed.emit(this.documents);
    }
  }

  on_foreign_document_opened(_host: VirtualDocument, context: IForeignContext) {
    DEBUG &&
      console.log(
        'LSP: ConnectionManager received foreign document: ',
        context.foreign_document.id_path
      );
  }

  on_foreign_document_closed(_host: VirtualDocument, context: IForeignContext) {
    const { foreign_document } = context;
    this.disconnect_document_signals(foreign_document);
  }

  private async connect_socket(
    options: ISocketConnectionOptions
  ): Promise<LSPConnection> {
    DEBUG && console.log('LSP: Connection Socket', options);
    let { virtual_document, language } = options;

    this.connect_document_signals(virtual_document);

    const uris = DocumentConnectionManager.solve_uris(
      virtual_document,
      language
    );

    const connection = await Private.connection(
      language,
      uris,
      this.on_new_connection
    );

    if (connection.isReady) {
      connection.sendOpen(virtual_document.document_info);
    }

    this.connections.set(virtual_document.id_path, connection);

    return connection;
  }

  on_new_connection = (connection: LSPConnection) => {
    connection.on('error', e => {
      DEBUG && console.warn(e);
      // TODO invalid now
      let error: Error = e.length && e.length >= 1 ? e[0] : new Error();
      // TODO: those codes may be specific to my proxy client, need to investigate
      if (error.message.indexOf('code = 1005') !== -1) {
        DEBUG && console.warn(`LSP: Connection failed for ${connection}`);
        this.forEachDocumentOfConnection(connection, virtual_document => {
          DEBUG &&
            console.warn('LSP: disconnecting ' + virtual_document.id_path);
          this.closed.emit({ connection, virtual_document });
          this.ignored_languages.add(virtual_document.language);
          DEBUG &&
            console.warn(
              `Cancelling further attempts to connect ${virtual_document.id_path} and other documents for this language (no support from the server)`
            );
        });
      } else if (error.message.indexOf('code = 1006') !== -1) {
        DEBUG && console.warn('LSP: Connection closed by the server ');
      } else {
        DEBUG && console.error('LSP: Connection error:', e);
      }
    });

    connection.on('serverInitialized', capabilities => {
      this.forEachDocumentOfConnection(connection, virtual_document => {
        this.initialized.emit({ connection, virtual_document });
      });
    });

    connection.on('close', closed_manually => {
      if (!closed_manually) {
        DEBUG && console.warn('LSP: Connection unexpectedly disconnected');
      } else {
        DEBUG && console.warn('LSP: Connection closed');
        this.forEachDocumentOfConnection(connection, virtual_document => {
          this.closed.emit({ connection, virtual_document });
        });
      }
    });
  };

  private forEachDocumentOfConnection(
    connection: LSPConnection,
    callback: (virtual_document: VirtualDocument) => void
  ) {
    for (const [
      virtual_document_id_path,
      a_connection
    ] of this.connections.entries()) {
      if (connection !== a_connection) {
        continue;
      }
      callback(this.documents.get(virtual_document_id_path));
    }
  }

  public async retry_to_connect(
    options: ISocketConnectionOptions,
    reconnect_delay: number,
    retrials_left = -1
  ) {
    let { virtual_document } = options;

    if (this.ignored_languages.has(virtual_document.language)) {
      return;
    }

    let interval = reconnect_delay * 1000;
    let success = false;

    while (retrials_left !== 0 && !success) {
      await this.connect(options)
        .then(() => {
          success = true;
        })
        .catch(e => {
          DEBUG && console.warn(e);
        });

      DEBUG &&
        console.log(
          'LSP: will attempt to re-connect in ' + interval / 1000 + ' seconds'
        );
      await sleep(interval);

      // gradually increase the time delay, up to 5 sec
      interval = interval < 5 * 1000 ? interval + 500 : interval;
    }
  }

  async connect(options: ISocketConnectionOptions) {
    DEBUG && console.log('LSP: connection requested', options);
    let connection = await this.connect_socket(options);

    let { virtual_document, document_path } = options;

    if (!connection.isReady) {
      try {
        await until_ready(() => connection.isReady, 100, 200);
      } catch {
        DEBUG &&
          console.warn(
            `LSP: Connect timed out for ${virtual_document.id_path}`
          );
        return;
      }
    }

    DEBUG &&
      console.log(
        'LSP:',
        document_path,
        virtual_document.id_path,
        'connected.'
      );

    this.connected.emit({ connection, virtual_document });

    return connection;
  }

  public unregister_document(virtual_document: VirtualDocument) {
    const connection = this.connections.get(virtual_document.id_path);
    this.connections.delete(virtual_document.id_path);
    this.closed.emit({ connection, virtual_document });
  }
}

export namespace DocumentConnectionManager {
  export function solve_uris(
    virtual_document: VirtualDocument,
    language: string
  ): IURIs {
    const wsBase = PageConfig.getBaseUrl().replace(/^http/, 'ws');
    const rootUri = PageConfig.getOption('rootUri');
    const virtualDocumentsUri = PageConfig.getOption('virtualDocumentsUri');

    const baseUri = virtual_document.has_lsp_supported_file
      ? rootUri
      : virtualDocumentsUri;

    return {
      base: baseUri,
      document: URLExt.join(baseUri, virtual_document.uri),
      server: URLExt.join('ws://jupyter-lsp', language),
      socket: URLExt.join(wsBase, 'lsp', language)
    };
  }

  export interface IURIs {
    base: string;
    document: string;
    server: string;
    socket: string;
  }
}

namespace Private {
  const _connections = new Map<string, LSPConnection>();
  let _promise: Promise<typeof ConnectionModuleType>;

  export async function connection(
    language: string,
    uris: DocumentConnectionManager.IURIs,
    onCreate: (connection: LSPConnection) => void
  ): Promise<LSPConnection> {
    if (_promise == null) {
      _promise = import(
        /* webpackChunkName: "jupyter-lsp-connection" */ './connection'
      );
    }

    const { LSPConnection } = await _promise;
    let connection = _connections.get(language);

    if (connection == null) {
      const socket = new WebSocket(uris.socket);
      const connection = new LSPConnection({
        languageId: language,
        serverUri: uris.server,
        rootUri: uris.base
      });
      _connections.set(language, connection);
      connection.connect(socket);
      onCreate(connection);
    }

    connection = _connections.get(language);

    return connection;
  }
}
