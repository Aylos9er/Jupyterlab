// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

// tslint:disable-next-line
/// <reference path="./typings/json-to-html/json-to-html.d.ts"/>

import json2html = require('json-to-html');

import { simulate } from 'simulate-event';

import { ServiceManager } from '@jupyterlab/services';

import { ClientSession } from '@jupyterlab/apputils';

import { nbformat } from '@jupyterlab/coreutils';

import { UUID } from '@phosphor/coreutils';

import {
  TextModelFactory,
  DocumentRegistry,
  Context
} from '@jupyterlab/docregistry';

import { INotebookModel, NotebookModelFactory } from '@jupyterlab/notebook';

import {
  IRenderMime,
  RenderMimeRegistry,
  RenderedHTML,
  standardRendererFactories
} from '@jupyterlab/rendermime';

/**
 * Return a promise that resolves in the given milliseconds with the given value.
 */
export function sleep<T>(milliseconds: number = 0, value?: T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve(value);
    }, milliseconds);
  });
}

/**
 * Get a copy of the default rendermime instance.
 */
export function defaultRenderMime(): RenderMimeRegistry {
  return Private.rendermime.clone();
}

/**
 * Create a client session object.
 */
export async function createClientSession(
  options: Partial<ClientSession.IOptions> = {}
): Promise<ClientSession> {
  const manager = options.manager || Private.manager.sessions;

  await manager.ready;
  return new ClientSession({
    manager,
    path: options.path || UUID.uuid4(),
    name: options.name,
    type: options.type,
    kernelPreference: options.kernelPreference || {
      shouldStart: true,
      canStart: true,
      name: manager.specs.default
    }
  });
}

/**
 * Create a context for a file.
 */
export function createFileContext(
  path?: string,
  manager?: ServiceManager.IManager
): Context<DocumentRegistry.IModel> {
  const factory = Private.textFactory;

  manager = manager || Private.manager;
  path = path || UUID.uuid4() + '.txt';

  return new Context({ manager, factory, path });
}

/**
 * Create a context for a notebook.
 */
export async function createNotebookContext(
  path?: string,
  manager?: ServiceManager.IManager
): Promise<Context<INotebookModel>> {
  const factory = Private.notebookFactory;

  manager = manager || Private.manager;
  path = path || UUID.uuid4() + '.ipynb';
  await manager.ready;

  return new Context({
    manager,
    factory,
    path,
    kernelPreference: { name: manager.specs.default }
  });
}

/**
 * Wait for a dialog to be attached to an element.
 */
export function waitForDialog(
  host?: HTMLElement,
  timeout?: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let counter = 0;
    const interval = 25;
    const limit = Math.floor((timeout || 250) / interval);
    const seek = () => {
      if (++counter === limit) {
        reject(new Error('Dialog not found'));
        return;
      }

      if ((host || document.body).getElementsByClassName('jp-Dialog')[0]) {
        resolve(undefined);
        return;
      }

      setTimeout(seek, interval);
    };

    seek();
  });
}

/**
 * Accept a dialog after it is attached by accepting the default button.
 */
export async function acceptDialog(
  host?: HTMLElement,
  timeout?: number
): Promise<void> {
  host = host || document.body;
  await waitForDialog(host, timeout);

  const node = host.getElementsByClassName('jp-Dialog')[0];

  if (node) {
    simulate(node as HTMLElement, 'keydown', { keyCode: 13 });
  }
}

/**
 * Dismiss a dialog after it is attached.
 *
 * #### Notes
 * This promise will always resolve successfully.
 */
export async function dismissDialog(
  host?: HTMLElement,
  timeout?: number
): Promise<void> {
  host = host || document.body;

  try {
    await waitForDialog(host, timeout);
  } catch (error) {
    return; // Ignore calls to dismiss the dialog if there is no dialog.
  }

  const node = host.getElementsByClassName('jp-Dialog')[0];

  if (node) {
    simulate(node as HTMLElement, 'keydown', { keyCode: 27 });
  }
}

/**
 * A namespace for private data.
 */
namespace Private {
  export const manager = new ServiceManager();

  export const textFactory = new TextModelFactory();

  export const notebookFactory = new NotebookModelFactory({});

  class JSONRenderer extends RenderedHTML {
    mimeType = 'text/html';

    renderModel(model: IRenderMime.IMimeModel): Promise<void> {
      let source = model.data['application/json'];
      model.setData({ data: { 'text/html': json2html(source) } });
      return super.renderModel(model);
    }
  }

  const jsonRendererFactory = {
    mimeTypes: ['application/json'],
    safe: true,
    createRenderer(
      options: IRenderMime.IRendererOptions
    ): IRenderMime.IRenderer {
      return new JSONRenderer(options);
    }
  };

  export const rendermime = new RenderMimeRegistry({
    initialFactories: standardRendererFactories
  });
  rendermime.addFactory(jsonRendererFactory, 10);
}

/**
 * The default outputs used for testing.
 */
export const DEFAULT_OUTPUTS: nbformat.IOutput[] = [
  {
    name: 'stdout',
    output_type: 'stream',
    text: ['hello world\n', '0\n', '1\n', '2\n']
  },
  {
    name: 'stderr',
    output_type: 'stream',
    text: ['output to stderr\n']
  },
  {
    name: 'stderr',
    output_type: 'stream',
    text: ['output to stderr2\n']
  },
  {
    output_type: 'execute_result',
    execution_count: 1,
    data: { 'text/plain': 'foo' },
    metadata: {}
  },
  {
    output_type: 'display_data',
    data: { 'text/plain': 'hello, world' },
    metadata: {}
  },
  {
    output_type: 'error',
    ename: 'foo',
    evalue: 'bar',
    traceback: ['fizz', 'buzz']
  }
];
