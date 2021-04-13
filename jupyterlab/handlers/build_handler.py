"""Tornado handlers for frontend config storage."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.
from concurrent.futures import ThreadPoolExecutor
import json
from threading import Event

from jupyter_server.base.handlers import APIHandler
from jupyter_server.extension.handler import ExtensionHandlerMixin
from tornado import gen, web
from tornado.concurrent import run_on_executor

from ..commands import build, clean, build_check, AppOptions, _ensure_options
from ..coreconfig import CoreConfig


class Builder(object):
    building = False
    executor = ThreadPoolExecutor(max_workers=5)
    canceled = False
    _canceling = False
    _kill_event = None
    _future = None

    def __init__(self, core_mode, app_options=None):
        app_options = _ensure_options(app_options)
        self.log = app_options.logger
        self.core_mode = core_mode
        self.app_dir = app_options.app_dir
        self.core_config = app_options.core_config
        self.labextensions_path = app_options.labextensions_path

    @gen.coroutine
    def get_status(self):
        if self.core_mode:
            raise gen.Return(dict(status='stable', message=''))
        if self.building:
            raise gen.Return(dict(status='building', message=''))

        try:
            messages = yield self._run_build_check(
                self.app_dir, self.log, self.core_config, self.labextensions_path)
            status = 'needed' if messages else 'stable'
            if messages:
                self.log.warn('Build recommended')
                [self.log.warn(m) for m in messages]
            else:
                self.log.info('Build is up to date')
        except ValueError as e:
            self.log.warn(
                'Could not determine jupyterlab build status without nodejs'
            )
            status = 'stable'
            messages = []

        raise gen.Return(dict(status=status, message='\n'.join(messages)))

    @gen.coroutine
    def build(self):
        if self._canceling:
            raise ValueError('Cancel in progress')
        if not self.building:
            self.canceled = False
            self._future = future = gen.Future()
            self.building = True
            self._kill_event = evt = Event()
            try:
                yield self._run_build(
                    self.app_dir, self.log, evt, self.core_config, self.labextensions_path)
                future.set_result(True)
            except Exception as e:
                if str(e) == 'Aborted':
                    future.set_result(False)
                else:
                    future.set_exception(e)
            finally:
                self.building = False
        try:
            yield self._future
        except Exception as e:
            raise e

    @gen.coroutine
    def cancel(self):
        if not self.building:
            raise ValueError('No current build')
        self._canceling = True
        yield self._future
        self._canceling = False
        self.canceled = True

    @run_on_executor
    def _run_build_check(self, app_dir, logger, core_config, labextensions_path):
        return build_check(app_options=AppOptions(
            app_dir=app_dir, logger=logger, core_config=core_config, labextensions_path=labextensions_path))

    @run_on_executor
    def _run_build(self, app_dir, logger, kill_event, core_config, labextensions_path):
        app_options = AppOptions(
            app_dir=app_dir, logger=logger, kill_event=kill_event,
            core_config=core_config, labextensions_path=labextensions_path)
        try:
            return build(app_options=app_options)
        except Exception as e:
            if self._kill_event.is_set():
                return
            self.log.warn('Build failed, running a clean and rebuild')
            clean(app_options=app_options)
            return build(app_options=app_options)


class BuildHandler(ExtensionHandlerMixin, APIHandler):

    def initialize(self, builder=None, name=None):
        super(BuildHandler, self).initialize(name=name)
        self.builder = builder

    @web.authenticated
    @gen.coroutine
    def get(self):
        data = yield self.builder.get_status()
        self.finish(json.dumps(data))

    @web.authenticated
    @gen.coroutine
    def delete(self):
        self.log.warning('Canceling build')
        try:
            yield self.builder.cancel()
        except Exception as e:
            raise web.HTTPError(500, str(e))
        self.set_status(204)

    @web.authenticated
    @gen.coroutine
    def post(self):
        self.log.debug('Starting build')
        try:
            yield self.builder.build()
        except Exception as e:
            raise web.HTTPError(500, str(e))

        if self.builder.canceled:
            raise web.HTTPError(400, 'Build canceled')

        self.log.debug('Build succeeded')
        self.set_status(200)


# The path for lab build.
build_path = r"/lab/api/build"
