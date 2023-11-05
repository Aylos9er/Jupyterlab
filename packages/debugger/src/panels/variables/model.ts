// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ISignal, Signal } from '@lumino/signaling';

import { IDebugger } from '../../tokens';

/**
 * A model for a variable explorer.
 */
export class VariablesModel implements IDebugger.Model.IVariables {
  get expandedVariables(): IDebugger.Model.IVariableContext[] {
    const expanded: IDebugger.Model.IVariableContext[] = [];
    for (const scope of this._state) {
      expanded.push(...listExpandedChildren(scope.name, scope.variables));
    }
    return expanded;

    function listExpandedChildren(
      scope: string,
      variables: IDebugger.IVariable[],
      parents?: string[]
    ): IDebugger.Model.IVariableContext[] {
      return variables.reduce<IDebugger.Model.IVariableContext[]>(
        (agg, variable) => {
          if (variable.expanded === true) {
            agg.push({
              scope,
              variable: variable.name,
              parents
            });
          }
          if (variable.children?.length) {
            const p = (parents ?? []).concat(variable.name);
            agg.push(...listExpandedChildren(scope, variable.children, p));
          }
          return agg;
        },
        []
      );
    }
  }

  /**
   * The scopes.
   */
  get scopes(): IDebugger.IScope[] {
    return this._state.slice();
  }
  set scopes(scopes: IDebugger.IScope[]) {
    const oldExpansion = this.expandedVariables;
    this._state = scopes.slice();

    if (this._variablesToExpand.length == 0 && scopes.length) {
      // Backup latest non-empty expansion state
      if (oldExpansion.length) {
        this._latestExpansionState = oldExpansion;
      }
      if (this._latestExpansionState.length > 0) {
        this._variablesToExpand = [...this._latestExpansionState];
        this._latestExpansionState.length = 0;
      }
    }

    if (this._variablesToExpand.length > 0) {
      let context: IDebugger.Model.IVariableContext | undefined;
      while (
        typeof (context = this._variablesToExpand.shift()) !== 'undefined'
      ) {
        // check the variable exist before requesting its expansion
        // we cannot check a priori as the variable tree is not yet expanded
        const scope = scopes.find(s => s.name == context!.scope);
        if (scope) {
          let container = scope.variables;
          for (const p of context!.parents ?? []) {
            container = container.find(v => v.name == p)?.children ?? [];
          }
          if (container.length) {
            const variable = container.find(v => v.name == context!.variable);
            if (variable) {
              variable.expanded = true;
              if (!variable.children?.length) {
                this._variableExpanded.emit(context);
                return;
              }
            }
          }
        }
      }
    }

    this._changed.emit();
  }

  /**
   * Signal emitted when the current variable has changed.
   */
  get changed(): ISignal<this, void> {
    return this._changed;
  }

  /**
   * Signal emitted when the current variable has been expanded.
   */
  get variableExpanded(): ISignal<this, IDebugger.Model.IVariableContext> {
    return this._variableExpanded;
  }

  get selectedVariable(): IDebugger.IVariableSelection | null {
    return this._selectedVariable;
  }
  set selectedVariable(selection: IDebugger.IVariableSelection | null) {
    this._selectedVariable = selection;
  }

  /**
   * Expand a variable.
   *
   * @param variable The variable to expand.
   * @deprecated This is a no-op
   */
  expandVariable(variable: IDebugger.IVariable): void {
    // no-op
  }

  /**
   * Toggle variable expansion state.
   *
   * @param context The variable context.
   */
  toggleVariableExpansion(context: IDebugger.Model.IVariableContext): void {
    let scope = this._state.find(scope => scope.name === context.scope);
    if (!scope) {
      scope = { name: context.scope, variables: [] };
      this._state.push(scope);
    }

    const parents = context.parents ?? [];
    let container = scope.variables;
    for (let deep = 0; deep < parents.length; deep++) {
      const parent = container.find(item => item.name === parents[deep]);
      if (!parent) {
        return;
      }
      if (typeof parent.children === 'undefined') {
        parent.children = [];
      }
      container = parent.children;
    }
    const expandingItem = container.find(
      item => item.name === context.variable
    );
    if (!expandingItem) {
      return;
    }

    expandingItem.expanded = !expandingItem.expanded;
    if (expandingItem.expanded === true) {
      // Variable expanded will set new scopes through `DebuggerService._onVariableExpanded`.
      this._variableExpanded.emit(context);
    }
    this._changed.emit();
  }

  private _selectedVariable: IDebugger.IVariableSelection | null = null;
  private _state: IDebugger.IScope[] = [];
  private _latestExpansionState: IDebugger.Model.IVariableContext[] = [];
  private _variablesToExpand: IDebugger.Model.IVariableContext[] = [];
  private _variableExpanded = new Signal<
    this,
    IDebugger.Model.IVariableContext
  >(this);
  private _changed = new Signal<this, void>(this);
}
