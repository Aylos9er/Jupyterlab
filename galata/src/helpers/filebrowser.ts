// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Page } from '@playwright/test';
import * as path from 'path';
import { ContentsHelper } from '../contents';
import * as Utils from '../utils';

/**
 * File Browser Helpers
 */
export class FileBrowserHelper {
  constructor(
    readonly page: Page,
    readonly contents: ContentsHelper
  ) {}

  /**
   * Create the selector for a file in the file browser
   *
   * @param fileName File name
   * @returns XPath to file in file browser
   */
  xpBuildFileSelector(fileName: string): string {
    return `//div[@id='filebrowser']//li[./span[${Utils.xpContainsClass(
      'jp-DirListing-itemText'
    )} and ./span[text()="${fileName}"]]]`;
  }

  /**
   * Create the selector for a directory in the file browser
   *
   * @param dirName Directory name
   * @returns XPath to directory in file browser
   */
  xpBuildDirectorySelector(dirName: string): string {
    return `//div[@id='filebrowser']//li[@data-isdir='true' and ./span[${Utils.xpContainsClass(
      'jp-DirListing-itemText'
    )} and ./span[text()="${dirName}"]]]`;
  }

  /**
   * Reveal a file in the file browser.
   *
   * It will open intermediate folders if needed.
   *
   * @param filePath File path
   */
  async revealFileInBrowser(filePath: string): Promise<void> {
    const pos = filePath.lastIndexOf('/');
    const fileName = path.basename(filePath);
    if (pos >= 0) {
      const dirPath = filePath.substring(0, pos);
      await this.openDirectory(dirPath);
    }

    await Utils.waitForCondition(() => this.isFileListedInBrowser(fileName));
  }

  /**
   * Whether the file is listed in the file browser or not.
   *
   * @param fileName File name
   * @returns File status
   */
  async isFileListedInBrowser(fileName: string): Promise<boolean> {
    const item = this.page
      .getByRole('region', { name: 'File Browser Section' })
      .getByRole('listitem', { name: new RegExp(`^Name: ${fileName}`) });

    return (await item.count()) > 0;
  }

  /**
   * Get the full path of the currently opened directory
   *
   * @returns Directory full path
   */
  async getCurrentDirectory(): Promise<string> {
    const breadcrumbs = this.page
      .getByRole('region', { name: 'File Browser Section' })
      .locator('.jp-FileBrowser-crumbs > span');
    const count = await breadcrumbs.count();
    return (await breadcrumbs.nth(count - 2).getAttribute('title')) ?? '';
  }

  /**
   * Open a file
   *
   * Note: This will double click on the file;
   * an editor needs to be available for the given file type.
   *
   * @param filePath File path
   * @param factory Document factory to use
   * @returns Action success status
   */
  async open(filePath: string, factory?: string): Promise<boolean> {
    await this.revealFileInBrowser(filePath);
    const name = path.basename(filePath);

    const fileItem = this.page
      .getByRole('region', { name: 'File Browser Section' })
      .getByRole('listitem', { name: new RegExp(`^Name: ${name}`) });
    if (await fileItem.count()) {
      if (factory) {
        await fileItem.click({ button: 'right' });
        await this.page
          .getByRole('listitem')
          .filter({ hasText: 'Open With' })
          .click();
        await this.page
          .getByRole('menuitem', { name: factory, exact: true })
          .click();
      } else {
        await fileItem.dblclick();
      }
      // Use `last` as if a file is already open, it will simply be activated
      // if not it will be opened with optionally another factory (but we don't have a way
      // to know that from the DOM).
      await this.page
        .getByRole('main')
        .getByRole('tab', { name: new RegExp(`^${name}`) })
        .last()
        .waitFor({
          state: 'visible'
        });
    } else {
      return false;
    }

    return true;
  }

  /**
   * Open the Home directory.
   *
   * @returns Action success status
   */
  async openHomeDirectory(): Promise<boolean> {
    const breadcrumbs = this.page
      .getByRole('region', { name: 'File Browser Section' })
      .locator('.jp-FileBrowser-crumbs > span');
    const homeButton = this.page
      .getByRole('region', { name: 'File Browser Section' })
      .locator('.jp-BreadCrumbs-home');

    if (!((await homeButton.count()) == 1)) {
      return false;
    }
    await homeButton.click();

    await homeButton.waitFor();

    // When in home directory, we have only two spans
    Utils.waitForCondition(async () => (await breadcrumbs.count()) == 2);

    return true;
  }

  /**
   * Open a given directory in the file browser
   *
   * @param dirPath Directory path
   * @returns Action success status
   */
  async openDirectory(dirPath: string): Promise<boolean> {
    if (!(await this.openHomeDirectory())) {
      return false;
    }

    const directories = dirPath.split('/');
    let path = '';

    for (const directory of directories) {
      if (directory.trim() === '') {
        continue;
      }
      if (path !== '') {
        path += '/';
      }

      path += directory;

      if (!(await this._openDirectory(directory))) {
        return false;
      }

      await Utils.waitForCondition(async () => {
        return (await this.getCurrentDirectory()) === path;
      });
    }

    return true;
  }

  /**
   * Trigger a file browser refresh
   */
  async refresh(): Promise<void> {
    const button = this.page.getByRole('button', {
      name: 'Refresh the file browser.'
    });

    this.contents.waitForAPIResponse(async () => {
      await button.click();
    });
  }

  protected async _openDirectory(dirName: string): Promise<boolean> {
    const item = this.page
      .getByRole('region', { name: 'File Browser Section' })
      .getByRole('listitem', { name: new RegExp(`^Name: ${dirName}`) });
    if (!((await item.count()) > 0)) {
      return false;
    }

    await this.contents.waitForAPIResponse(async () => {
      await item.dblclick();
    });
    await this.page
      .getByRole('region', { name: 'File Browser Section' })
      .getByText(`/${dirName}/`)
      .waitFor();

    return true;
  }
}
