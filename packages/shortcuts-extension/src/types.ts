/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import type { ReadonlyPartialJSONObject } from '@lumino/coreutils';
import type { CommandRegistry } from '@lumino/commands';
import type { ISignal } from '@lumino/signaling';
import type { Menu } from '@lumino/widgets';
import type { ISettingRegistry } from '@jupyterlab/settingregistry';
import type { ITranslator } from '@jupyterlab/translation';

export namespace CommandIDs {
  export const editBinding = 'shortcuts:edit-keybinding';
  export const addBinding = 'shortcuts:add-keybinding';
  export const deleteBinding = 'shortcuts:delete-keybinding';
}

export interface IShortcutsSettingsLayout {
  [index: string]: any;
  shortcuts: CommandRegistry.IKeyBindingOptions[];
}

interface IChangeKebindingRequest {
  /**
   * Identifier of the requested action.
   */
  request: 'edit-keybinding' | 'delete-keybinding';
  /**
   * Identifier of the shortcut target.
   */
  shortcutId: string;
  /**
   * Index of the keybinding to edit.
   */
  keybinding: number;
}

interface IAddKeybindingReuest {
  /**
   * Identifier of the requested action.
   */
  request: 'add-keybinding';
  /**
   * Identifier of the shortcut target.
   */
  shortcutId: string;
}
export type KebindingRequest = IChangeKebindingRequest | IAddKeybindingReuest;

/**
 * A bundle of actions and objects passed down from the extension entry point.
 */
export interface IExternalBundle {
  translator: ITranslator;
  getSettings: () => Promise<
    ISettingRegistry.ISettings<IShortcutsSettingsLayout>
  >;
  removeShortCut: (key: string) => Promise<void>;
  createMenu: () => Menu;
  commandRegistry: Omit<CommandRegistry, 'execute'>;
  actionRequested: ISignal<unknown, KebindingRequest>;
}

export interface IKeybinding {
  /**
   * A chain of keys that needs to be pressed to invoke the keybinding.
   *
   * Note that each "key" in the chain may correspond to multiple key strokes,
   * for example ["Ctrl+A", "X"] is a valid value.
   */
  readonly keys: string[];
  /**
   * Whether this keybinding comes from default values (schema or default overrides), or is set by user.
   */
  isDefault: boolean;
}

/**
 * A shortcut target represents a unique combination of a command, selector, and arguments.
 *
 * Each shortcut target can have multiple keybindings assigned.
 */
export interface IShortcutTarget {
  /**
   * Unique key assigned to the shortcut target.
   */
  readonly id: string;
  /**
   * Identifier of the command invoked by this shortcut.
   */
  readonly command: string;
  /**
   * A list of keybindings assigned to this target.
   */
  readonly keybindings: IKeybinding[];
  readonly selector: string;
  readonly label?: string;
  readonly category: string;
  readonly args: ReadonlyPartialJSONObject | undefined;
}

export namespace IShortcutUI {
  export type ColumnId =
    | 'label'
    | 'selector'
    | 'category'
    | 'source'
    | 'command';
}

export interface IShortcutUI {
  /**
   * Set the sort order for the shortcuts listing.
   */
  updateSort(value: IShortcutUI.ColumnId): void;
  /**
   * Delete a single keybinding for given shortcut target.
   */
  deleteKeybinding(
    target: IShortcutTarget,
    keybinding: IKeybinding
  ): Promise<void>;
  /**
   * Reset keybindings for given target to defaults.
   */
  resetKeybindings(target: IShortcutTarget): Promise<void>;
  /**
   * Add a new keybinding.
   */
  addKeybinding(target: IShortcutTarget, keys: string[]): Promise<void>;
  /**
   * Replace the given keybinding with a new keybinding as defined by given keys.
   */
  replaceKeybinding(
    target: IShortcutTarget,
    keybinding: IKeybinding,
    keys: string[]
  ): Promise<void>;
}

export interface IShortcutRegistry extends Map<string, IShortcutTarget> {
  findConflictsFor(keys: string[], selector: string): IShortcutTarget[];
}
