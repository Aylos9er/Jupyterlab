# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

import json
from typing import NamedTuple
from unittest.mock import MagicMock, Mock, patch

try:
    from unittest.mock import AsyncMock
except ImportError:
    AsyncMock = None

import pytest
import tornado
from jupyter_server.utils import ensure_async
from traitlets.config import Config, Configurable

from jupyterlab.extensions import PyPiExtensionManager, ReadOnlyExtensionManager
from jupyterlab.extensions.manager import ExtensionManager, ExtensionPackage


class Response(NamedTuple):
    """Fake tornado response."""

    body: bytes


def to_async_mock(args):
    """Convert arguments to awaitable arguments or asynchronous mock."""
    if AsyncMock is None:
        return ensure_async(args)
    else:
        return AsyncMock(return_value=args)


@pytest.mark.parametrize(
    "version, expected",
    (
        ("1", "1"),
        ("1.0", "1.0"),
        ("1.0.0", "1.0.0"),
        ("1.0.0a52", "1.0.0-alpha.52"),
        ("1.0.0b3", "1.0.0-beta.3"),
        ("1.0.0rc22", "1.0.0-rc.22"),
        ("1.0.0rc23.post2", "1.0.0-rc.23"),
        ("1.0.0rc24.dev2", "1.0.0-rc.24"),
        ("1.0.0rc25.post4.dev2", "1.0.0-rc.25"),
    ),
)
def test_ExtensionManager_get_semver_version(version, expected):
    assert ExtensionManager.get_semver_version(version) == expected


async def test_ExtensionManager_list_extensions_installed(monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")

    async def mock_installed(*args, **kwargs):
        return {"extension1": extension1}

    monkeypatch.setattr(ReadOnlyExtensionManager, "_get_installed_extensions", mock_installed)

    manager = ReadOnlyExtensionManager()

    extensions = await manager.list_extensions()

    assert extensions == ([extension1], 1)


async def test_ExtensionManager_list_extensions_query(monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")
    extension2 = ExtensionPackage("extension2", "Extension 2 description", "", "prebuilt")

    async def mock_list(*args, **kwargs):
        return {"extension1": extension1, "extension2": extension2}, None

    monkeypatch.setattr(ReadOnlyExtensionManager, "list_packages", mock_list)

    manager = ReadOnlyExtensionManager()

    extensions = await manager.list_extensions("ext")

    assert extensions == ([extension1, extension2], 1)


@patch("tornado.httpclient.AsyncHTTPClient")
async def test_ExtensionManager_list_extensions_query_allow(mock_client, monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")
    extension2 = ExtensionPackage("extension2", "Extension 2 description", "", "prebuilt")

    mock_client.return_value = MagicMock(
        spec=tornado.httpclient.AsyncHTTPClient,
        fetch=to_async_mock(
            Response(json.dumps({"allowed_extensions": [{"name": "extension1"}]}).encode())
        ),
    )

    async def mock_list(*args, **kwargs):
        return {"extension1": extension1, "extension2": extension2}, None

    monkeypatch.setattr(ReadOnlyExtensionManager, "list_packages", mock_list)

    manager = ReadOnlyExtensionManager(
        ext_options=dict(allowed_extensions_uris={"http://dummy-allowed-extension"}),
    )

    extensions = await manager.list_extensions("ext")

    assert extensions == ([extension1], 1)


@patch("tornado.httpclient.AsyncHTTPClient")
async def test_ExtensionManager_list_extensions_query_block(mock_client, monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")
    extension2 = ExtensionPackage("extension2", "Extension 2 description", "", "prebuilt")

    mock_client.return_value = MagicMock(
        spec=tornado.httpclient.AsyncHTTPClient,
        fetch=to_async_mock(
            Response(json.dumps({"blocked_extensions": [{"name": "extension1"}]}).encode())
        ),
    )

    async def mock_list(*args, **kwargs):
        return {"extension1": extension1, "extension2": extension2}, None

    monkeypatch.setattr(ReadOnlyExtensionManager, "list_packages", mock_list)

    manager = ReadOnlyExtensionManager(
        ext_options=dict(blocked_extensions_uris={"http://dummy-blocked-extension"})
    )

    extensions = await manager.list_extensions("ext")

    assert extensions == ([extension2], 1)


@patch("tornado.httpclient.AsyncHTTPClient")
async def test_ExtensionManager_list_extensions_query_allow_block(mock_client, monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")
    extension2 = ExtensionPackage("extension2", "Extension 2 description", "", "prebuilt")

    mock_client.return_value = MagicMock(
        spec=tornado.httpclient.AsyncHTTPClient,
        fetch=to_async_mock(
            Response(
                json.dumps(
                    {
                        "allowed_extensions": [{"name": "extension1"}],
                        "blocked_extensions": [{"name": "extension1"}],
                    }
                ).encode()
            )
        ),
    )

    async def mock_list(*args, **kwargs):
        return {"extension1": extension1, "extension2": extension2}, None

    monkeypatch.setattr(ReadOnlyExtensionManager, "list_packages", mock_list)

    manager = ReadOnlyExtensionManager(
        ext_options=dict(
            allowed_extensions_uris={"http://dummy-allowed-extension"},
            blocked_extensions_uris={"http://dummy-blocked-extension"},
        )
    )

    extensions = await manager.list_extensions("ext")

    assert extensions == ([extension1], 1)


async def test_ExtensionManager_install():
    manager = ReadOnlyExtensionManager()

    result = await manager.install("extension1")

    assert result.status == "error"
    assert result.message == "Extension installation not supported."


async def test_ExtensionManager_uninstall():
    manager = ReadOnlyExtensionManager()

    result = await manager.uninstall("extension1")

    assert result.status == "error"
    assert result.message == "Extension removal not supported."


@patch("jupyterlab.extensions.pypi.xmlrpc.client")
async def test_PyPiExtensionManager_list_extensions_query(mocked_rpcclient):
    extension1 = ExtensionPackage(
        name="jupyterlab-git",
        description="A JupyterLab extension for version control using git",
        url="https://github.com/jupyterlab/jupyterlab-git",
        pkg_type="prebuilt",
        latest_version="0.37.1",
        author="Jupyter Development Team",
        license="BSD-3-Clause",
    )
    extension2 = ExtensionPackage(
        name="jupyterlab-github",
        description="JupyterLab viewer for GitHub repositories",
        url="https://github.com/jupyterlab/jupyterlab-github",
        pkg_type="prebuilt",
        latest_version="3.0.1",
        author="Ian Rose",
        license="BSD-3-Clause",
    )

    proxy = Mock(
        browse=Mock(
            return_value=[
                ["jupyterlab-git", "0.33.0"],
                ["jupyterlab-git", "0.34.0"],
                ["jupyterlab-git", "0.34.1"],
                ["jupyterlab-git", "0.37.0"],
                ["jupyterlab-git", "0.37.1"],
                ["jupyterlab-github", "3.0.0"],
                ["jupyterlab-github", "3.0.1"],
            ]
        ),
        release_data=Mock(
            side_effect=[
                {
                    "name": "jupyterlab-git",
                    "version": "0.37.1",
                    "stable_version": None,
                    "bugtrack_url": None,
                    "package_url": "https://pypi.org/project/jupyterlab-git/",
                    "release_url": "https://pypi.org/project/jupyterlab-git/0.37.1/",
                    "docs_url": None,
                    "home_page": "https://github.com/jupyterlab/jupyterlab-git",
                    "download_url": "",
                    "project_url": [],
                    "author": "Jupyter Development Team",
                    "author_email": "",
                    "maintainer": "",
                    "maintainer_email": "",
                    "summary": "A JupyterLab extension for version control using git",
                    "license": "BSD-3-Clause",
                    "keywords": "Jupyter,JupyterLab,JupyterLab3,jupyterlab-extension,Git",
                    "platform": "Linux",
                    "classifiers": [
                        "Framework :: Jupyter",
                        "Framework :: Jupyter :: JupyterLab",
                        "Framework :: Jupyter :: JupyterLab :: 3",
                        "Framework :: Jupyter :: JupyterLab :: Extensions",
                        "Framework :: Jupyter :: JupyterLab :: Extensions :: Prebuilt",
                        "Intended Audience :: Developers",
                        "Intended Audience :: Science/Research",
                        "License :: OSI Approved :: BSD License",
                        "Programming Language :: Python",
                        "Programming Language :: Python :: 3",
                        "Programming Language :: Python :: 3.10",
                        "Programming Language :: Python :: 3.6",
                        "Programming Language :: Python :: 3.7",
                        "Programming Language :: Python :: 3.8",
                        "Programming Language :: Python :: 3.9",
                    ],
                    "requires": [],
                    "requires_dist": [
                        "jupyter-server",
                        "nbdime (~=3.1)",
                        "nbformat",
                        "packaging",
                        "pexpect",
                        "black ; extra == 'dev'",
                        "coverage ; extra == 'dev'",
                        "jupyter-packaging (~=0.7.9) ; extra == 'dev'",
                        "jupyterlab (~=3.0) ; extra == 'dev'",
                        "pre-commit ; extra == 'dev'",
                        "pytest ; extra == 'dev'",
                        "pytest-asyncio ; extra == 'dev'",
                        "pytest-cov ; extra == 'dev'",
                        "pytest-tornasync ; extra == 'dev'",
                        "black ; extra == 'tests'",
                        "coverage ; extra == 'tests'",
                        "jupyter-packaging (~=0.7.9) ; extra == 'tests'",
                        "jupyterlab (~=3.0) ; extra == 'tests'",
                        "pre-commit ; extra == 'tests'",
                        "pytest ; extra == 'tests'",
                        "pytest-asyncio ; extra == 'tests'",
                        "pytest-cov ; extra == 'tests'",
                        "pytest-tornasync ; extra == 'tests'",
                        "hybridcontents ; extra == 'tests'",
                        "jupytext ; extra == 'tests'",
                    ],
                    "provides": [],
                    "provides_dist": [],
                    "obsoletes": [],
                    "obsoletes_dist": [],
                    "requires_python": "<4,>=3.6",
                    "requires_external": [],
                    "_pypi_ordering": 55,
                    "downloads": {"last_day": -1, "last_week": -1, "last_month": -1},
                    "cheesecake_code_kwalitee_id": None,
                    "cheesecake_documentation_id": None,
                    "cheesecake_installability_id": None,
                },
                {
                    "name": "jupyterlab-github",
                    "version": "3.0.1",
                    "stable_version": None,
                    "bugtrack_url": None,
                    "package_url": "https://pypi.org/project/jupyterlab-github/",
                    "release_url": "https://pypi.org/project/jupyterlab-github/3.0.1/",
                    "docs_url": None,
                    "home_page": "https://github.com/jupyterlab/jupyterlab-github",
                    "download_url": "",
                    "project_url": [],
                    "author": "Ian Rose",
                    "author_email": "jupyter@googlegroups.com",
                    "maintainer": "",
                    "maintainer_email": "",
                    "summary": "JupyterLab viewer for GitHub repositories",
                    "license": "BSD-3-Clause",
                    "keywords": "Jupyter,JupyterLab,JupyterLab3",
                    "platform": "Linux",
                    "classifiers": [
                        "Framework :: Jupyter",
                        "Framework :: Jupyter :: JupyterLab",
                        "Framework :: Jupyter :: JupyterLab :: 3",
                        "Framework :: Jupyter :: JupyterLab :: Extensions",
                        "Framework :: Jupyter :: JupyterLab :: Extensions :: Prebuilt",
                        "License :: OSI Approved :: BSD License",
                        "Programming Language :: Python",
                        "Programming Language :: Python :: 3",
                        "Programming Language :: Python :: 3.6",
                        "Programming Language :: Python :: 3.7",
                        "Programming Language :: Python :: 3.8",
                        "Programming Language :: Python :: 3.9",
                    ],
                    "requires": [],
                    "requires_dist": ["jupyterlab (~=3.0)"],
                    "provides": [],
                    "provides_dist": [],
                    "obsoletes": [],
                    "obsoletes_dist": [],
                    "requires_python": ">=3.6",
                    "requires_external": [],
                    "_pypi_ordering": 12,
                    "downloads": {"last_day": -1, "last_week": -1, "last_month": -1},
                    "cheesecake_code_kwalitee_id": None,
                    "cheesecake_documentation_id": None,
                    "cheesecake_installability_id": None,
                },
            ]
        ),
    )
    mocked_rpcclient.ServerProxy = Mock(return_value=proxy)

    manager = PyPiExtensionManager()

    extensions = await manager.list_extensions("git")

    assert extensions == ([extension1, extension2], 1)


async def test_PyPiExtensionManager_custom_server_url():
    BASE_URL = "https://mylocal.pypi.server/pypi"

    parent = Configurable(config=Config({"PyPiExtensionManager": {"base_url": BASE_URL}}))

    manager = PyPiExtensionManager(parent=parent)

    assert manager.base_url == BASE_URL
