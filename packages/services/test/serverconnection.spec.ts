// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { PageConfig } from '@jupyterlab/coreutils';
import { JupyterServer } from '@jupyterlab/testing';
import { ServerConnection } from '../src';
import { getRequestHandler } from './utils';

const server = new JupyterServer();

beforeAll(async () => {
  await server.start();
}, 30000);

afterAll(async () => {
  await server.shutdown();
});

describe('ServerConnection', () => {
  describe('.makeRequest()', () => {
    it('should make a request to the server', async () => {
      const settings = getRequestHandler(200, 'hello');
      const response = await ServerConnection.makeRequest(
        settings.baseUrl,
        {},
        settings
      );
      expect(response.statusText).toBe('OK');
      const data = await response.json();
      expect(data).toBe('hello');
    });
  });

  describe('.makeSettings()', () => {
    it('should use default settings', () => {
      const settings = ServerConnection.makeSettings();
      expect(settings.baseUrl).toBe(PageConfig.getBaseUrl());
      expect(settings.wsUrl).toBe(PageConfig.getWsUrl());
      expect(settings.token).toBe(PageConfig.getOption('token'));
    });

    it('should use baseUrl for wsUrl', () => {
      const conf: Partial<ServerConnection.ISettings> = {
        baseUrl: 'https://host/path'
      };
      const settings = ServerConnection.makeSettings(conf);
      expect(settings.baseUrl).toBe(conf.baseUrl);
      expect(settings.wsUrl).toBe('wss://host/path');
    });

    it('should handle overrides', () => {
      const defaults: Partial<ServerConnection.ISettings> = {
        baseUrl: 'http://localhost/foo',
        wsUrl: 'http://localhost/bar',
        init: {
          credentials: 'same-origin'
        },
        token: 'baz'
      };
      const settings = ServerConnection.makeSettings(defaults);
      expect(settings.baseUrl).toBe(defaults.baseUrl);
      expect(settings.wsUrl).toBe(defaults.wsUrl);
      expect(settings.token).toBe(defaults.token);
      expect(settings.init.credentials).toBe(defaults.init!.credentials);
    });
  });

  describe('.makeError()', () => {
    it('should create a server error from a server response', async () => {
      const settings = getRequestHandler(200, 'hi');
      const init = { body: 'hi', method: 'POST' };
      const response = await ServerConnection.makeRequest(
        settings.baseUrl,
        init,
        settings
      );
      const err = new ServerConnection.ResponseError(response);
      expect(err.message).toBe('Invalid response: 200 OK');
    });
  });

  describe('ResponseError', () => {
    describe('#create', () => {
      it.each([
        {
          status: 456,
          statusText: 'Dummy error'
        },
        {
          status: 456,
          statusText: 'Dummy error',
          message: 'Nice error message'
        },
        {
          status: 456,
          statusText: 'Dummy error',
          traceback: 'Nice traceback'
        },
        {
          status: 456,
          statusText: 'Dummy error',
          message: 'Nice error message',
          traceback: 'Nice traceback'
        },
      ])('should create a error response from %j', async (data) => {
        const error = await ResponseError.create(
          {
            json: jest.fn().mockImplementation(
              async () => {
                Promise.resolve(data)
              }
            )
          } as any
        );

        expect(error.message).toEqual(data.message ?? 'Invalid response: 456 Dummy error')
        expect(error.traceback).toEqual(data.traceback ?? '')
      });
    });
  });
});
