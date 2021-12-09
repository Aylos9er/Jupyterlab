// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { caretDownIcon, userIcon } from '@jupyterlab/ui-components';
import { Menu, MenuBar } from '@lumino/widgets';
import { h, VirtualElement } from '@lumino/virtualdom';

import { ICurrentUser } from './tokens';

/**
 * Custom renderer for the user menu.
 */
export class RendererUserMenu extends MenuBar.Renderer {
  private _user: ICurrentUser;

  /**
   * Constructor of the class RendererUserMenu.
   *
   * @argument user Current user object.
   */
  constructor(user: ICurrentUser) {
    super();
    this._user = user;
  }

  /**
   * Render the virtual element for a menu bar item.
   *
   * @param data - The data to use for rendering the item.
   *
   * @returns A virtual element representing the item.
   */
  renderItem(data: MenuBar.IRenderData): VirtualElement {
    let className = this.createItemClass(data);
    let dataset = this.createItemDataset(data);
    let aria = this.createItemARIA(data);

    if ('empty' in dataset && dataset.empty === 'true') {
      return h.li(
        { className, dataset, tabindex: '0', onfocus: data.onfocus, ...aria },
        this._createUserIcon(),
        this.renderLabel(data)
      );
    } else {
      return h.li(
        { className, dataset, tabindex: '0', onfocus: data.onfocus, ...aria },
        this._createUserIcon(),
        this.renderLabel(data),
        this.renderIcon(data)
      );
    }
  }

  /**
   * Render the label element for a menu item.
   *
   * @param data - The data to use for rendering the label.
   *
   * @returns A virtual element representing the item label.
   */
  renderLabel(data: MenuBar.IRenderData): VirtualElement {
    let content = this.formatLabel(data);
    return h.div(
      {
        className:
          'lm-MenuBar-itemLabel' +
          /* <DEPRECATED> */
          ' p-MenuBar-itemLabel' +
          /* </DEPRECATED> */
          ' jp-MenuBar-label'
      },
      content
    );
  }

  /**
   * Render the user icon element for a menu item.
   *
   * @returns A virtual element representing the item label.
   */
  private _createUserIcon(): VirtualElement {
    if (this._user.isReady && this._user.avatar_url) {
      return h.div(
        {
          className:
            'lm-MenuBar-itemIcon p-MenuBar-itemIcon jp-MenuBar-imageIcon'
        },
        h.img({ src: this._user.avatar_url })
      );
    } else if (this._user.isReady) {
      return h.div(
        {
          className:
            'lm-MenuBar-itemIcon p-MenuBar-itemIcon jp-MenuBar-anonymousIcon',
          style: { backgroundColor: this._user.color }
        },
        h.span({}, this._user.initials)
      );
    } else {
      return h.div(
        {
          className:
            'lm-MenuBar-itemIcon p-MenuBar-itemIcon jp-MenuBar-anonymousIcon'
        },
        userIcon
      );
    }
  }
}

/**
 * Custom lumino Menu for the user menu.
 */
export class UserMenu extends Menu {
  private _user: ICurrentUser;

  constructor(options: UserMenu.IOptions) {
    super(options);
    this._user = options.user;
    const name =
      this._user.familyName !== ''
        ? `${this._user.givenName} ${this._user.familyName}`
        : this._user.givenName;
    this.title.label = this._user.isReady ? name : '';
    this.title.icon = caretDownIcon;
    this.title.iconClass = 'jp-UserMenu-caretDownIcon';
    this.title.dataset = { empty: 'true' };
    this.dataset.empty = 'true';
    this._user.ready.connect(this._updateLabel);
    this._user.changed.connect(this._updateLabel);
  }

  dispose() {
    this._user.ready.disconnect(this._updateLabel);
    this._user.changed.disconnect(this._updateLabel);
  }

  private _updateLabel = (user: ICurrentUser) => {
    const name =
      user.familyName !== ''
        ? `${user.givenName} ${user.familyName}`
        : user.givenName;
    this.title.label = name;
    this.update();
  };

  /**
   * Insert a menu item into the menu at the specified index.
   *
   * @param index - The index at which to insert the item.
   *
   * @param options - The options for creating the menu item.
   *
   * @returns The menu item added to the menu.
   *
   * #### Notes
   * The index will be clamped to the bounds of the items.
   */
  insertItem(index: number, options: Menu.IItemOptions): Menu.IItem {
    this.dataset.empty = 'false';
    this.title.dataset = { ...this.title.dataset, empty: 'false' };
    return super.insertItem(index, options);
  }

  /**
   * Remove the item at a given index from the menu.
   *
   * @param index - The index of the item to remove.
   *
   * #### Notes
   * This is a no-op if the index is out of range.
   */
  removeItemAt(index: number): void {
    super.removeItemAt(index);
    if (this.items.length === 0) {
      this.dataset.empty = 'true';
      this.title.dataset = { ...this.title.dataset, empty: 'true' };
    }
  }

  /**
   * Remove all menu items from the menu.
   */
  clearItems(): void {
    super.clearItems();
    this.dataset.empty = 'true';
    this.title.dataset = { ...this.title.dataset, empty: 'true' };
  }
}

/**
 * Namespace of the UserMenu class.
 */
export namespace UserMenu {
  /**
   * User menu options interface
   */
  export interface IOptions extends Menu.IOptions {
    /**
     * Current user object.
     */
    user: ICurrentUser;
  }
}
