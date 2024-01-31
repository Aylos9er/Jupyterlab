// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { expect, test } from '@jupyterlab/galata';
//Chose dimensions prioritizing WCAG for low vision support.
//Viewport of 320x256 CSS pixels is equilavent to an initial starting viewport of 1280x1024 CSS pixels at 400% zoom.
//Ensures accessibility for varying visual acuity.
//Constraints include balancing device requirements and maintaining responsiveness.
test.use({ viewport: { width: 320, height: 256 } });

test.describe('Low Vision / Zoom Support', () => {
  test.beforeEach(async ({ page }) => {
    // Close the left sidebar before these tests because we are unable to support
    // showing both the sidebar and the main area for small screen / high zoom.
    // Close the left sidebar before these tests because we are currently and
    // probably never will be able fully fit both the sidebar and the main area
    // side-by-side together on small screens / high zoom.
    await page.sidebar.close('left');
  });

  test('Full page, small viewport', async ({ page }) => {
    expect(await page.screenshot({ fullPage: true })).toMatchSnapshot(
      'full-page-small-viewport.png'
    );
  });

  test('Clipped full page screenshot for Menubar, small viewport', async ({
    page
  }) => {
    expect(
      await page.screenshot({
        fullPage: true,
        clip: { x: 0, y: 0, width: 320, height: 100 }
      })
    ).toMatchSnapshot('clipped-full-page-screenshot-for-Menubar.png');
  });

  test('Menubar, small viewport', async ({ page }) => {
    expect(await page.locator('#jp-top-panel').screenshot()).toMatchSnapshot(
      'menu-bar-small-viewport.png'
    );
  });

  test('Left tab bar, small viewport', async ({ page }) => {
    const tabbar = await page.sidebar.getTabBar();
    expect(await tabbar.screenshot()).toMatchSnapshot(
      'left-tab-bar-small-viewport.png'
    );
  });

  test('Right tab bar, small viewport', async ({ page }) => {
    const tabbar = await page.sidebar.getTabBar('right');
    expect(await tabbar.screenshot()).toMatchSnapshot(
      'right-tab-bar-small-viewport.png'
    );
  });

  test('Status bar, small viewport', async ({ page }) => {
    expect(
      await page.locator('#jp-main-statusbar').screenshot()
    ).toMatchSnapshot('status-bar-small-viewport.png');
  });
});
