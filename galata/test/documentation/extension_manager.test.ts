// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IJupyterLabPageFixture, test } from '@jupyterlab/galata';
import { expect } from '@playwright/test';

test.use({ autoGoto: false, viewport: { height: 720, width: 1280 } });

test.describe('Extension Manager', () => {
  test('Sidebar', async ({ page }) => {
    await page.goto();

    await openExtensionSidebar(page);

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 31px; left: 0px; width: 283px; height: 600px;"></div>'
      );
    });


    await page.waitForFrame(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('extensions_default.png');
  });

  test('Warning', async ({ page }) => {
    await page.goto();

    await page.click('[title="Extension Manager"]');

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 31px; left: 0px; width: 283px; height: 400px;"></div>'
      );
    });


    await page.waitForFrame(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('extensions_disabled.png');
  });

  test('Warning acknowledge', async ({ page }) => {
    await page.goto();

    await openExtensionSidebar(page);

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 31px; left: 0px; width: 283px; height: 400px;"></div>'
      );
    });


    await page.waitForFrame(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('extensions_enabled.png');
  });

  test('Search', async ({ page }) => {
    await page.goto();

    await openExtensionSidebar(page);

    await page.fill(
      '.jp-extensionmanager-view >> [placeholder="SEARCH"]',
      'drawio'
    );

    await page.keyboard.press('Tab');

    // We can not wait for extension kept by the keyword as they are already in the DOM
    await page.waitForSelector('text=No entries');

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 31px; left: 0px; width: 283px; height: 600px;"></div>'
      );
    });


    await page.waitForFrame(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('extensions_search.png');
  });

  test('With allowed and blocked list', async ({ page }) => {
    await page.route(
      /.*\/api\/listings\/.*\/listings\.json.*/,
      (route, request) => {
        if (request.method() === 'GET') {
          return route.fulfill({
            status: 200,
            body: `{
                "blocked_extensions_uris": ["http://banana.json"],
                "allowed_extensions_uris": ["http://orange.json"],
                "blocked_extensions": [{"name":"banana","type":"jupyterlab"}],
                "allowed_extensions": [{"name":"orange","type":"jupyterlab"}]
              }`
          });
        } else {
          return route.continue();
        }
      }
    );
    await page.goto();

    await page.click('[title="Extension Manager"]');

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 31px; left: 0px; width: 283px; height: 160px;"></div>'
      );
    });


    await page.waitForFrame(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('extensions_simultaneous_block_allow.png');
  });

  test('Blocked installed extension', async ({ page }) => {
    await page.route(
      /.*\/api\/listings\/.*\/listings\.json.*/,
      (route, request) => {
        if (request.method() === 'GET') {
          return route.fulfill({
            status: 200,
            body: `{
                "blocked_extensions_uris": ["http://banana.json"],
                "allowed_extensions_uris": [],
                "blocked_extensions": [{"name":"@jupyter-widgets/jupyterlab-manager","type":"jupyterlab"}],
                "allowed_extensions": []
              }`
          });
        } else {
          return route.continue();
        }
      }
    );
    await page.goto();

    await openExtensionSidebar(page);

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 110px; left: 33px; width: 250px; height: 280px;"></div>'
      );
    });


    await page.waitForFrame(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('extensions_blocked_list.png');
  });

  test('Allowed installed extension', async ({ page }) => {
    await page.route(
      /.*\/api\/listings\/.*\/listings\.json.*/,
      (route, request) => {
        if (request.method() === 'GET') {
          return route.fulfill({
            status: 200,
            body: `{
                "blocked_extensions_uris": [],
                "allowed_extensions_uris": ["http://banana.json"],
                "blocked_extensions": [],
                "allowed_extensions": [{"name":"@jupyter-widgets/jupyterlab-manager","type":"jupyterlab"}]
              }`
          });
        } else {
          return route.continue();
        }
      }
    );
    await page.goto();

    await openExtensionSidebar(page);

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 110px; left: 33px; width: 250px; height: 280px;"></div>'
      );
    });


    await page.waitForFrame(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('extensions_allowed_list.png');
  });
});

async function openExtensionSidebar(page: IJupyterLabPageFixture) {
  await page.click('[title="Extension Manager"]');

  await page.click('button:has-text("Enable")');
  await page.waitForSelector('button:has-text("Disable")');
  await page.click(
    '.jp-extensionmanager-view >> .jp-stack-panel-header >> button'
  );
}
