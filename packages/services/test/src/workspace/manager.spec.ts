// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import expect = require('expect.js');

import { WorkspaceManager, ServerConnection } from '../../../lib';

import { init } from '../utils';

// Initialize the fetch overrides.
init();

describe('workspace', () => {
  describe('WorkspaceManager', () => {
    const manager: WorkspaceManager = new WorkspaceManager({
      serverSettings: ServerConnection.makeSettings()
    });

    describe('#constructor()', () => {
      it('should accept no options', () => {
        const manager = new WorkspaceManager();
        expect(manager).to.be.a(WorkspaceManager);
      });

      it('should accept options', () => {
        const manager = new WorkspaceManager({
          serverSettings: ServerConnection.makeSettings()
        });
        expect(manager).to.be.a(WorkspaceManager);
      });
    });

    describe('#serverSettings', () => {
      it('should be the server settings', () => {
        const baseUrl = 'foo';
        const serverSettings = ServerConnection.makeSettings({ baseUrl });
        const manager = new WorkspaceManager({ serverSettings });
        expect(manager.serverSettings.baseUrl).to.be(baseUrl);
      });
    });

    describe('#fetch()', () => {
      it('should fetch a saved workspace', async () => {
        const id = 'foo';

        await manager.save(id, { data: {}, metadata: { id } });
        expect((await manager.fetch(id)).metadata.id).to.be(id);
        await manager.remove(id);
      });
    });

    describe('#list()', () => {
      it('should fetch a list of workspaces', async () => {
        const ids = ['foo', 'bar', 'baz'];

        for (let id of ids) {
          await manager.save(id, { data: {}, metadata: { id } });
        }
        expect((await manager.list()).sort()).to.eql(ids.sort());
        for (let id of ids) {
          await manager.save(id, { data: {}, metadata: { id } });
        }
      });
    });

    describe('#remove()', () => {
      it('should remove a workspace', async () => {
        const id = 'foo';

        await manager.save(id, { data: {}, metadata: { id } });
        expect((await manager.fetch(id)).metadata.id).to.be(id);
        await manager.remove(id);
      });
    });

    describe('#save()', () => {
      it('should save a workspace', async () => {
        const id = 'foo';

        await manager.save(id, { data: {}, metadata: { id } });
        expect((await manager.fetch(id)).metadata.id).to.be(id);
        await manager.remove(id);
      });
    });
  });
});
