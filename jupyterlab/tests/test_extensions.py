import json
from typing import NamedTuple
from unittest.mock import Mock, patch

from jupyterlab.extensions import PyPiExtensionsManager, ReadOnlyExtensionsManager
from jupyterlab.extensions.manager import ExtensionPackage


async def test_ExtensionsManager_list_extensions_installed(monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")

    async def mock_installed(*args, **kwargs):
        return {"extension1": extension1}

    monkeypatch.setattr(ReadOnlyExtensionsManager, "_get_installed_extensions", mock_installed)

    manager = ReadOnlyExtensionsManager()

    extensions = await manager.list_extensions()

    assert extensions == {extension1}


async def test_ExtensionsManager_list_extensions_query(monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")
    extension2 = ExtensionPackage("extension2", "Extension 2 description", "", "prebuilt")

    async def mock_list(*args, **kwargs):
        return {"extension1": extension1, "extension2": extension2}, None

    monkeypatch.setattr(ReadOnlyExtensionsManager, "list_packages", mock_list)

    manager = ReadOnlyExtensionsManager()

    extensions = await manager.list_extensions("ext")

    assert extensions == {extension1, extension2}


@patch("jupyterlab.extensions.manager.requests")
async def test_ExtensionsManager_list_extensions_query_allow(mock_requests, monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")
    extension2 = ExtensionPackage("extension2", "Extension 2 description", "", "prebuilt")

    class Request(NamedTuple):
        text: str

    mock_requests.request.return_value = Request(
        json.dumps({"allowed_extensions": [{"name": "extension1"}]})
    )

    async def mock_list(*args, **kwargs):
        return {"extension1": extension1, "extension2": extension2}, None

    monkeypatch.setattr(ReadOnlyExtensionsManager, "list_packages", mock_list)

    manager = ReadOnlyExtensionsManager(
        ext_options=dict(allowed_extensions_uris={"http://dummy-allowed-extension"})
    )

    extensions = await manager.list_extensions("ext")

    assert extensions == {extension1}


@patch("jupyterlab.extensions.manager.requests")
async def test_ExtensionsManager_list_extensions_query_block(mock_requests, monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")
    extension2 = ExtensionPackage("extension2", "Extension 2 description", "", "prebuilt")

    class Request(NamedTuple):
        text: str

    mock_requests.request.return_value = Request(
        json.dumps({"blocked_extensions": [{"name": "extension1"}]})
    )

    async def mock_list(*args, **kwargs):
        return {"extension1": extension1, "extension2": extension2}, None

    monkeypatch.setattr(ReadOnlyExtensionsManager, "list_packages", mock_list)

    manager = ReadOnlyExtensionsManager(
        ext_options=dict(blocked_extensions_uris={"http://dummy-blocked-extension"})
    )

    extensions = await manager.list_extensions("ext")

    assert extensions == {extension2}


@patch("jupyterlab.extensions.manager.requests")
async def test_ExtensionsManager_list_extensions_query_allow_block(mock_requests, monkeypatch):
    extension1 = ExtensionPackage("extension1", "Extension 1 description", "", "prebuilt")
    extension2 = ExtensionPackage("extension2", "Extension 2 description", "", "prebuilt")

    class Request(NamedTuple):
        text: str

    mock_requests.request.return_value = Request(
        json.dumps(
            {
                "allowed_extensions": [{"name": "extension1"}],
                "blocked_extensions": [{"name": "extension1"}],
            }
        )
    )

    async def mock_list(*args, **kwargs):
        return {"extension1": extension1, "extension2": extension2}, None

    monkeypatch.setattr(ReadOnlyExtensionsManager, "list_packages", mock_list)

    manager = ReadOnlyExtensionsManager(
        ext_options=dict(
            allowed_extensions_uris={"http://dummy-allowed-extension"},
            blocked_extensions_uris={"http://dummy-blocked-extension"},
        )
    )

    extensions = await manager.list_extensions("ext")

    assert extensions == {extension1}


async def test_ExtensionsManager_install():
    manager = ReadOnlyExtensionsManager()

    result = await manager.install("extension1")

    assert result.status == "error"
    assert result.message == "Extension installation not supported."


async def test_ExtensionsManager_uninstall():
    manager = ReadOnlyExtensionsManager()

    result = await manager.uninstall("extension1")

    assert result.status == "error"
    assert result.message == "Extension removal not supported."


@patch("jupyterlab.extensions.pypi.xmlrpc.client")
async def test_PyPiExtensionsManager_list_extensions_query(mocked_rpcclient):
    extension1 = ExtensionPackage(
        name="jupyterlab-git",
        description="A JupyterLab extension for version control using git",
        url="https://github.com/jupyterlab/jupyterlab-git",
        pkg_type="prebuilt",
        latest_version="0.37.1",
    )
    extension2 = ExtensionPackage(
        name="jupyterlab-github",
        description="JupyterLab viewer for GitHub repositories",
        url="https://github.com/jupyterlab/jupyterlab-github",
        pkg_type="prebuilt",
        latest_version="3.0.1",
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

    manager = PyPiExtensionsManager()

    extensions = await manager.list_extensions("git")

    assert extensions == {extension1, extension2}
