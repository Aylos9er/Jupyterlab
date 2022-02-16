// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { galata, test } from '@jupyterlab/galata';
import { expect } from '@playwright/test';

test.use({
  autoGoto: false,
  mockState: galata.DEFAULT_DOCUMENTATION_STATE,
  viewport: { height: 720, width: 1280 }
});

test.describe('Export Notebook', () => {
  test('Export Menu', async ({ page }) => {
    await page.goto();

    await page.dblclick(
      '[aria-label="File Browser Section"] >> text=notebooks'
    );
    await page.dblclick('text=Lorenz.ipynb');

    await page.waitForSelector('text=Python 3 (ipykernel) | Idle');

    await page.click('text=File');
    await page.click('ul[role="menu"] >> text=Save and Export Notebook As');

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 5px; left: 0px; width: 700px; height: 700px;"></div>'
      );
    });

    // Wait for Latex renderer
    await page.waitForSelector('text=(𝜎σ, 𝛽β, 𝜌ρ)');

    await page.waitForFrames(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('exporting_menu.png');
  });

  test('Slides', async ({ page }) => {
    await page.goto();

    await page.dblclick(
      '[aria-label="File Browser Section"] >> text=notebooks'
    );
    await page.dblclick('text=Lorenz.ipynb');

    await page.waitForSelector('text=Python 3 (ipykernel) | Idle');

    await page.click('[title="Property Inspector"]');
    await page.pause();
    await page.selectOption(
      '.jp-PropertyInspector >> text=Slide Type >> select',
      { label: 'Slide' }
    );

    // Inject capture zone
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div id="capture-screenshot" style="position: absolute; top: 5px; left: 283px; width: 997px; height: 400px;"></div>'
      );
    });

    // Wait for Latex renderer
    await page.waitForSelector('text=(𝜎σ, 𝛽β, 𝜌ρ)');

    await page.waitForFrames(3);
    expect(
      await (await page.$('#capture-screenshot')).screenshot()
    ).toMatchSnapshot('exporting_slide_type.png');
  });
});
