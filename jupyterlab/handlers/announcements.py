"""Announcements handler for JupyterLab."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.

import json
import time
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, field
from typing import Awaitable, Optional

from jupyter_server.base.handlers import APIHandler
from jupyterlab_server.translation_utils import translator
from packaging.version import parse
from tornado import httpclient, web

from .._version import __version__

ISO8601_FORMAT = "%Y-%m-%dT%H:%M:%S%z"
JUPYTERLAB_LAST_RELEASE_URL = "https://pypi.org/pypi/jupyterlab/json"
JUPYTERLAB_RELEASE_URL = "https://github.com/jupyterlab/jupyterlab/releases/tag/v"


@dataclass(frozen=True)
class Notification:
    """Notification

    Attributes:
        message: Notification message
        type: Notification type — ["default", "error", "info", "success", "warning"]
        options: Notification options
    """

    createdAt: float
    message: str
    modifiedAt: float
    type: str = "default"
    options: dict = field(default_factory=dict)


class CheckForUpdate:
    """Default class to check for update.

    Args:
        version: Current JupyterLab version
    """

    def __init__(self, version: str) -> None:
        self._version = version

    async def __call__(self) -> Awaitable[Optional[str]]:
        """Get the notification message if a new version is available.

        Returns:
            The notification message or None if there is not update.
        """
        http_client = httpclient.AsyncHTTPClient()
        try:
            response = await http_client.fetch(
                JUPYTERLAB_LAST_RELEASE_URL,
                headers={"Content-Type": "application/json"},
            )
            data = json.loads(response.body).get("info")
            last_version = data["version"]
        except Exception as e:
            self.log.debug("Failed to get latest version", exc_info=e)
        else:
            if parse(__version__) < parse(last_version):
                trans = translator.load("jupyterlab")
                return trans.__(
                    f"A newer version ({last_version}) of JupyterLab is available.\n"
                    f'See the <a href="{JUPYTERLAB_RELEASE_URL}{last_version}" target="_blank" rel="noreferrer">changelog</a>'
                    " for more information."
                )
            else:
                return None


class NeverCheckForUpdate(CheckForUpdate):
    """Check update version that does nothing.

    This is provided for administrators that want to
    turn off requesting external resources.
    """

    async def __call__(self) -> Awaitable[Optional[str]]:
        """Get the notification message if a new version is available.

        Returns:
            The notification message or None if there is not update.
        """
        return None


class CheckForUpdateHandler(APIHandler):
    """Check for Updates API handler.

    Args:
        update_check: The class checking for a new version
    """

    def initialize(
        self,
        update_checker: Optional[CheckForUpdate] = None,
    ) -> None:
        super().initialize()
        self.update_checker = (
            NeverCheckForUpdate(__version__) if update_checker is None else update_checker
        )

    @web.authenticated
    async def get(self):
        """Check for updates.
        Response:
            {
                "notification": Optional[Notification]
            }
        """
        notification = None
        message = await self.update_checker()
        if message:
            now = time.time() * 1000.0
            notification = Notification(
                message=message,
                createdAt=now,
                modifiedAt=now,
                type="info",
                options={"data": {"tags": ["update"]}},
            )

        self.set_status(200)
        self.finish(
            json.dumps({"notification": None if notification is None else asdict(notification)})
        )


class NewsHandler(APIHandler):
    """News API handler.

    Args:
        news_url: The Atom feed to fetch for news
    """

    def initialize(
        self,
        news_url: Optional[str] = None,
    ) -> None:
        super().initialize()
        self.news_url = news_url

    @web.authenticated
    async def get(self):
        """Get the news.

        Response:
            {
                "news": List[Notification]
            }
        """
        news = []

        http_client = httpclient.AsyncHTTPClient()

        if self.news_url is not None:
            # Those registrations are global, naming them to reduce chance of clashes
            xml_namespaces = {"atom": "http://www.w3.org/2005/Atom"}
            for key, spec in xml_namespaces.items():
                ET.register_namespace(key, spec)

            try:
                response = await http_client.fetch(
                    self.news_url,
                    headers={"Content-Type": "application/atom+xml"},
                )
                tree = ET.fromstring(response.body)

                def build_entry(node):
                    return Notification(
                        message=node.find("atom:title", xml_namespaces).text
                        # New paragraph
                        + "\n\n" + node.find("atom:summary", xml_namespaces).text
                        # Break line
                        + "  \n"
                        + "See {0}full post{1} for more details.".format(
                            # Use HTML link syntax instead of Markdown otherwise
                            # link will open in the same browser tab
                            '<a href="{}" target="_blank" rel="noreferrer">'.format(
                                node.find("atom:link", xml_namespaces).get("href")
                            ),
                            "</a>",
                        ),
                        createdAt=time.strptime(
                            node.find("atom:published", xml_namespaces).text,
                            ISO8601_FORMAT,
                        ),
                        modifiedAt=time.strptime(
                            node.find("atom:updated", xml_namespaces).text,
                            ISO8601_FORMAT,
                        ),
                        type="info",
                        options={
                            "data": {
                                "id": node.find("atom:id", xml_namespaces).text,
                                "tags": ["news"],
                            }
                        },
                    )

                news.extend(map(build_entry, tree.findall("atom:entry", xml_namespaces)))
            except Exception as e:
                self.log.debug(
                    f"Failed to get announcements from Atom feed: {self.news_url}",
                    exc_info=e,
                )

        self.set_status(200)
        self.finish(json.dumps({"news": list(map(asdict, news))}))


news_handler_path = r"/lab/api/news"
check_update_handler_path = r"/lab/api/update"
