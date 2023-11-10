// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
import { expect, IJupyterLabPageFixture, test } from '@jupyterlab/galata';
import { PromiseDelegate } from '@lumino/coreutils';
import * as path from 'path';

async function openNotebook(
  page: IJupyterLabPageFixture,
  tmpPath: string,
  fileName: string
) {
  await page.contents.uploadFile(
    path.resolve(__dirname, `./notebooks/${fileName}`),
    `${tmpPath}/${fileName}`
  );
  await page.notebook.openByPath(`${tmpPath}/${fileName}`);
  await page.getByText('Python 3 (ipykernel) | Idle').waitFor();
}

test.describe('Debugger Tests', () => {
  test.afterEach(async ({ page }) => {
    await page.debugger.switchOff();
    await page.waitForTimeout(500);
    await page.notebook.close();
  });

  test('Move Debugger to right', async ({ page }) => {
    await page.sidebar.moveTabToRight('jp-debugger-sidebar');
    expect(await page.sidebar.getTabPosition('jp-debugger-sidebar')).toBe(
      'right'
    );
  });

  test('Open Debugger on right', async ({ page }) => {
    await page.sidebar.openTab('jp-debugger-sidebar');
    expect(await page.sidebar.isTabOpen('jp-debugger-sidebar')).toBeTruthy();
  });

  test('Start debug session', async ({ page, tmpPath }) => {
    await openNotebook(page, tmpPath, 'code_notebook.ipynb');

    await page.debugger.switchOn();
    await page.waitForCondition(() => page.debugger.isOpen());

    await page.notebook.waitForCellGutter(0);
    await page.notebook.clickCellGutter(0, 2);

    await page.debugger.waitForBreakPoints();
    const breakpointsPanel = await page.debugger.getBreakPointsPanel();
    expect(await breakpointsPanel.innerText()).toMatch(/ipykernel/);

    const callStackPanel = await page.debugger.getCallStackPanel();
    expect(await callStackPanel.innerText()).toBe('');

    // don't add await, run will be blocked by the breakpoint
    void page.notebook.run().then();

    await page.debugger.waitForCallStack();
    expect(await callStackPanel.innerText()).toMatch(/ipykernel/);

    await page.debugger.waitForVariables();
    const variablesPanel = await page.debugger.getVariablesPanel();
    expect(await variablesPanel.screenshot()).toMatchSnapshot(
      'start-debug-session-variables.png'
    );

    await page.debugger.waitForSources();
    const sourcesPanel = await page.debugger.getSourcePanel();
    expect(await sourcesPanel.screenshot()).toMatchSnapshot(
      'start-debug-session-sources.png'
    );
  });

  test('Rich variables inspector', async ({ page, tmpPath }) => {
    await page.contents.uploadFile(
      path.resolve(__dirname, './notebooks/WidgetArch.png'),
      `${tmpPath}/WidgetArch.png`
    );

    const notebookName = 'image_notebook.ipynb';
    const globalVar = 'global_img';
    const localVar = 'local_img';

    await openNotebook(page, tmpPath, notebookName);

    await page.debugger.switchOn();
    await page.waitForCondition(() => page.debugger.isOpen());

    await page.notebook.waitForCellGutter(0);
    await page.notebook.clickCellGutter(0, 8);
    await page.notebook.clickCellGutter(0, 11);

    // don't add await, run will be blocked by the breakpoint
    void page.notebook.run().then();
    await page.debugger.waitForCallStack();

    await page.debugger.waitForVariables();
    const variablesPanel = await page.debugger.getVariablesPanel();
    expect(await variablesPanel.screenshot()).toMatchSnapshot(
      'image-debug-session-global-variables.png'
    );

    await page.debugger.renderVariable(globalVar);
    let richVariableTab = await page.activity.getPanel(
      `${globalVar} - ${notebookName}`
    );
    expect(await richVariableTab.screenshot()).toMatchSnapshot(
      'image-debug-session-global-rich-variable.png'
    );

    await page.activity.closePanel(`${globalVar} - ${notebookName}`);

    await page.locator('button[title="Continue (F9)"]').click();
    expect(variablesPanel).not.toContain('ul');
    await page.debugger.waitForVariables();

    await page.debugger.renderVariable(localVar);
    richVariableTab = await page.activity.getPanel(
      `${localVar} - ${notebookName}`
    );
    expect(await richVariableTab.screenshot()).toMatchSnapshot(
      'image-debug-session-local-rich-variable.png'
    );
  });

  test('Start debug session (Script)', async ({ page, tmpPath }) => {
    await openNotebook(page, tmpPath, 'code_script.py');

    await page.click('div.jp-FileEditor', {
      button: 'right'
    });

    const menu = await page.menu.getOpenMenu();
    await (await menu.$('[data-command="fileeditor:create-console"]')).click();

    await page.waitForSelector('.jp-Dialog-body');
    const select = await page.$('.jp-Dialog-body >> select');
    const option = await select.$('option:has-text("ipykernel")');
    await select.selectOption(option);
    await page.click('div.jp-Dialog-content >> button:has-text("Select")');

    // activate the script tab
    await page.click('.jp-FileEditor');
    await page.debugger.switchOn();
    await page.waitForCondition(() => page.debugger.isOpen());
    await page.notebook.waitForCodeGutter();
    await page.notebook.clickCodeGutter(2);

    await page.debugger.waitForBreakPoints();
    const breakpointsPanel = await page.debugger.getBreakPointsPanel();
    expect(await breakpointsPanel.innerText()).toMatch(/ipykernel/);

    const callStackPanel = await page.debugger.getCallStackPanel();
    expect(await callStackPanel.innerText()).toBe('');

    // don't add await, run will be blocked by the breakpoint
    await page.menu.clickMenuItem('Run>Run All Code');

    await page.debugger.waitForCallStack();
    expect(await callStackPanel.innerText()).toMatch(/ipykernel/);

    await page.debugger.waitForVariables();
    const variablesPanel = await page.debugger.getVariablesPanel();
    expect(await variablesPanel.screenshot()).toMatchSnapshot(
      'start-debug-session-script-variables.png'
    );

    await page.debugger.waitForSources();
    const sourcesPanel = await page.debugger.getSourcePanel();
    expect(await sourcesPanel.screenshot()).toMatchSnapshot(
      'start-debug-session-script-sources.png'
    );
  });
});

test.describe('Debugger Variables', () => {
  test.use({ autoGoto: false });

  const copyToGlobalsRequest = new PromiseDelegate<void>();

  test.beforeEach(async ({ page, tmpPath }) => {
    // Listener to the websocket, to catch the 'copyToGlobals' request.
    page.on('websocket', ws => {
      ws.on('framesent', event => {
        let message = event.payload;
        if (Buffer.isBuffer(event.payload)) {
          message = event.payload.toString('binary');
        }
        if (message.includes('copyToGlobals')) {
          copyToGlobalsRequest.resolve();
        }
      });
    });

    // Initialize the debugger.
    await page.goto(`tree/${tmpPath}`);
    await createNotebook(page);

    await page.debugger.switchOn();
    await page.waitForCondition(() => page.debugger.isOpen());

    await setBreakpoint(page);
  });

  test('Copy to globals should work only for local variables', async ({
    page
  }) => {
    // Kernel supports copyToGlobals.
    await page.evaluate(async () => {
      const debuggerService = await window.galata.getPlugin(
        '@jupyterlab/debugger-extension:service'
      );
      debuggerService!.model.supportCopyToGlobals = true;
    });

    // Don't wait as it will be blocked.
    void page.notebook.runCell(1);

    // Wait to be stopped on the breakpoint and the local variables to be displayed.
    await page.debugger.waitForCallStack();

    // Expect the copy entry to be in the menu.
    await page.locator('select[aria-label="Scope"]').selectOption('Locals');
    await page.click('.jp-DebuggerVariables-body li span:text("local_var")', {
      button: 'right'
    });
    await expect(
      page.locator('.lm-Menu-content li div:text("Copy Variable to Globals")')
    ).toHaveCount(1);

    await expect(
      page.locator('.lm-Menu-content li div:text("Copy Variable to Globals")')
    ).toBeVisible();

    // Request the copy of the local variable to globals scope.
    await page.click(
      '.lm-Menu-content li[data-command="debugger:copy-to-globals"]'
    );

    // Wait for the request to be sent.
    await copyToGlobalsRequest.promise;

    // Expect the context menu for global variables to not have the 'copy' entry.
    await page.locator('select[aria-label="Scope"]').selectOption('Globals');
    await page.click(`.jp-DebuggerVariables-body li span:text("global_var")`, {
      button: 'right'
    });
    await expect(page.locator('.lm-Menu-content')).toBeVisible();
    await expect(
      page.locator('.lm-Menu-content li div:text("Copy Variable to Globals")')
    ).toHaveCount(0);
  });

  test('Copy to globals not available from kernel', async ({ page }) => {
    // Kernel doesn't support copyToGlobals.
    await page.evaluate(async () => {
      const debuggerService = await window.galata.getPlugin(
        '@jupyterlab/debugger-extension:service'
      );
      debuggerService!.model.supportCopyToGlobals = false;
    });

    // Don't wait as it will be blocked.
    void page.notebook.runCell(1);

    // Wait to be stopped on the breakpoint and the local variables to be displayed.
    await page.debugger.waitForCallStack();

    await page.locator('select[aria-label="Scope"]').selectOption('Locals');

    // Expect the menu entry not to be visible.
    await page.click('.jp-DebuggerVariables-body li span:text("local_var")', {
      button: 'right'
    });
    await expect(
      page.locator('.lm-Menu-content li div:text("Copy Variable to Globals")')
    ).not.toBeVisible();

    // Close the contextual menu
    await page.keyboard.press('Escape');
    await expect(
      page.locator('li.lm-Menu-item[data-command="debugger:copy-to-clipboard"]')
    ).toHaveCount(0);
  });

  test('Copy to clipboard', async ({ page }) => {
    // Don't wait as it will be blocked.
    void page.notebook.runCell(1);

    // Wait to be stopped on the breakpoint and the local variables to be displayed.
    await page.debugger.waitForCallStack();

    // Copy value to clipboard
    await page.locator('select[aria-label="Scope"]').selectOption('Locals');
    await page.click('.jp-DebuggerVariables-body li span:text("local_var")', {
      button: 'right'
    });
    await page.locator('.lm-Menu-itemLabel:text("Copy to Clipboard")').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('3');

    // Copy to clipboard disabled for variables with empty value
    await page.locator('select[aria-label="Scope"]').selectOption('Globals');
    await page
      .locator('.jp-DebuggerVariables-body :text("special variables")')
      .click({ button: 'right' });
    await expect(
      page.locator('li.lm-Menu-item[data-command="debugger:copy-to-clipboard"]')
    ).toHaveAttribute('aria-disabled', 'true');

    // Close the contextual menu
    await page.keyboard.press('Escape');
    await expect(
      page.locator('li.lm-Menu-item[data-command="debugger:copy-to-clipboard"]')
    ).toHaveCount(0);
  });
});

test.describe('Tree view', () => {
  test.afterEach(async ({ page }) => {
    await page.debugger.switchOff();
    await page.waitForTimeout(500);
    await page.notebook.close();
  });

  test('should preserve tree view state when executing', async ({
    page,
    tmpPath
  }) => {
    const name = 'code_notebook.ipynb';
    await openNotebook(page, tmpPath, name);
    await page.debugger.switchOn(name);
    await page.waitForCondition(() => page.debugger.isOpen());

    await page.notebook.waitForCellGutter(2);
    await page.notebook.clickCellGutter(2, 2);

    await page.debugger.waitForBreakPoints();

    await page.notebook.runCell(0);
    await page.notebook.runCell(1);

    // Expand a variable
    await page.getByRole('listitem').filter({ hasText: 'sysmodule' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: /^argvlist$/ })
      .click();

    const scopeSelect = page.getByRole('combobox', { name: 'Scope' });
    const argv1 = page.getByRole('listitem').filter({ hasText: /^1-f$/ });

    // Run without waiting as we will hit a breakpoint
    void page.notebook.run();
    await page.waitForCondition(
      async () => (await scopeSelect.inputValue()) === 'Locals'
    );

    // Check the tree is still expanded on breakpoint
    await scopeSelect.selectOption('Globals');
    await argv1.scrollIntoViewIfNeeded();
    await expect.soft(argv1).toHaveCount(1);

    await page.getByRole('button', { name: 'Continue (F9)' }).click();
    await page.waitForCondition(
      async () => (await scopeSelect.inputValue()) === 'Globals'
    );

    // Check the tree is still expanded on continue
    await argv1.waitFor();
    await expect(argv1).toHaveCount(1);

    await page.getByRole('button', { name: 'Continue (F9)' }).click();
    await page.waitForCondition(
      async () => (await scopeSelect.inputValue()) === 'Globals'
    );

    // Check the tree is still expanded on continue that terminates the cell execution
    await argv1.waitFor();
    await expect(argv1).toHaveCount(1);
  });

  test('should preserve tree view state when switching files', async ({
    page,
    tmpPath
  }) => {
    const name = 'code_notebook.ipynb';
    await openNotebook(page, tmpPath, name);
    await page.debugger.switchOn(name);
    await page.waitForCondition(() => page.debugger.isOpen());

    await page.notebook.runCell(0);
    await page.notebook.runCell(1);

    // Expand a variable
    await page.getByRole('listitem').filter({ hasText: 'sysmodule' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: /^argvlist$/ })
      .click();

    const argv1 = page.getByRole('listitem').filter({ hasText: /^1-f$/ });
    await expect.soft(argv1).toHaveCount(1);

    // Create a new notebook
    await page.notebook.createNew();
    // Debugger should be empty
    await expect.soft(argv1).toHaveCount(0);

    // Switch back to the notebook
    await page.activity.activateTab(name);

    await expect(argv1).toHaveCount(1);
  });
});

async function createNotebook(page: IJupyterLabPageFixture) {
  await page.notebook.createNew();

  await page.waitForSelector('text=Python 3 (ipykernel) | Idle');
}

async function setBreakpoint(page: IJupyterLabPageFixture) {
  await page.notebook.setCell(
    0,
    'code',
    'global_var = 1\ndef add(a, b):\nlocal_var = a + b\nreturn local_var'
  );
  await page.notebook.run();
  await page.notebook.addCell('code', 'result = add(1, 2)\nprint(result)');

  await page.notebook.clickCellGutter(0, 4);
}
