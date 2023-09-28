/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import { indentMore, insertTab } from '@codemirror/commands';
import { EditorState, Transaction } from '@codemirror/state';
import { COMPLETER_ENABLED_CLASS } from '@jupyterlab/completer';

/**
 * CodeMirror commands namespace
 */
export namespace StateCommands {
  /**
   * Indent or insert a tab as appropriate.
   */
  export function indentMoreOrInsertTab(target: {
    dom: HTMLElement;
    state: EditorState;
    dispatch: (transaction: Transaction) => void;
  }): boolean {
    if (target.dom.parentElement?.classList.contains(COMPLETER_ENABLED_CLASS)) {
      return false;
    }

    const arg = { state: target.state, dispatch: target.dispatch };
    const from = target.state.selection.main.from;
    const to = target.state.selection.main.to;
    if (from != to) {
      return indentMore(arg);
    }
    const line = target.state.doc.lineAt(from);
    const before = target.state.doc.slice(line.from, from).toString();
    if (/^\s*$/.test(before)) {
      return indentMore(arg);
    } else {
      return insertTab(arg);
    }
  }
}
