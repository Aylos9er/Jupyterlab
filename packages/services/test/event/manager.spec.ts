// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterServer } from '@jupyterlab/testutils';
import { EventManager, ServerConnection } from '../../src';
import { init } from '../utils';

// Initialize the fetch overrides.
init();

const server = new JupyterServer();

beforeAll(async () => {
  await server.start();
});

afterAll(async () => {
  await server.shutdown();
});

describe('setting', () => {
  describe('EventManager', () => {
    let manager: EventManager;

    beforeAll(() => {
      manager = new EventManager({
        serverSettings: ServerConnection.makeSettings({ appUrl: 'lab' })
      });
    });

    afterAll(() => {
      manager.dispose();
    });

    describe('#constructor()', () => {
      it('should accept no options', () => {
        const manager = new EventManager();
        expect(manager).toBeInstanceOf(EventManager);
      });

      it('should accept options', () => {
        const manager = new EventManager({
          serverSettings: ServerConnection.makeSettings()
        });
        expect(manager).toBeInstanceOf(EventManager);
      });
    });

    describe('#serverSettings', () => {
      it('should be the server settings', () => {
        const baseUrl = 'http://localhost/foo';
        const serverSettings = ServerConnection.makeSettings({ baseUrl });
        const manager = new EventManager({ serverSettings });
        expect(manager.serverSettings.baseUrl).toBe(baseUrl);
      });
    });
  });
});
