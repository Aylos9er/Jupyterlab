// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JSONObject
} from 'phosphor/lib/algorithm/json';

import {
  IDisposable
} from 'phosphor/lib/core/disposable';

import {
  AttachedProperty
} from 'phosphor/lib/core/properties';

import {
  clearSignalData, defineSignal, ISignal
} from 'phosphor/lib/core/signaling';

import {
  CommandRegistry
} from 'phosphor/lib/ui/commandregistry';

import {
  Widget
} from 'phosphor/lib/ui/widget';

import {
  IStateDB
} from '../statedb';



/**
 * An object that tracks widget instances.
 */
export
interface IInstanceTracker<T extends Widget> {
  /**
   * A signal emitted when the current widget changes.
   *
   * #### Notes
   * If the last widget being tracked is disposed, `null` will be emitted.
   */
  currentChanged: ISignal<this, T>;

  /**
   * The current widget is the most recently focused widget.
   */
  currentWidget: T;
}

/**
 * A class that keeps track of widget instances.
 *
 * #### Notes
 * This is meant to be used in conjunction with a `FocusTracker` and will
 * typically be kept in sync with focus tracking events.
 */
export
class InstanceTracker<T extends Widget> implements IInstanceTracker<T>, IDisposable {
  /**
   * Create a new instance tracker.
   */
  constructor(options: InstanceTracker.IOptions<T> = {}) {
    this._restore = options.restore;
    if (this._restore) {
      let { command, namespace, registry, state, when } = this._restore;
      let promises = [state.fetchNamespace(namespace)].concat(when);
      Promise.all(promises).then(([saved]) => {
        saved.forEach(args => {
          // Execute the command and if it fails, delete the state restore data.
          registry.execute(command, args.value)
            .catch(() => { state.remove(args.id); });
        });
      });
    }
  }

  /**
   * A signal emitted when the current widget changes.
   *
   * #### Notes
   * If the last widget being tracked is disposed, `null` will be emitted.
   */
  readonly currentChanged: ISignal<this, T>;

  /**
   * The current widget is the most recently focused widget.
   */
  get currentWidget(): T {
    return this._currentWidget;
  }

  /**
   * Test whether the tracker is disposed.
   */
  get isDisposed(): boolean {
    return this._widgets === null;
  }

  /**
   * Add a new widget to the tracker.
   */
  add(widget: T): void {
    if (this._widgets.has(widget)) {
      console.warn(`${widget.id} has already been added to the tracker.`);
      return;
    }
    this._widgets.add(widget);

    // Handle widget state restoration.
    if (this._restore) {
      let { namespace, state } = this._restore;
      let widgetName = this._restore.name(widget);

      if (widgetName) {
        let name = `${namespace}:${widgetName}`;
        Private.nameProperty.set(widget, name);
        state.save(name, this._restore.args(widget));
      }
    }

    // Handle widget disposal.
    widget.disposed.connect(() => {
      this._widgets.delete(widget);
      // If restore data was saved, delete it from the database.
      if (this._restore) {
        let { state } = this._restore;
        let name = Private.nameProperty.get(widget);

        if (name) {
          state.remove(name);
        }
      }
      // If this was the last widget being disposed, emit null.
      if (!this._widgets.size) {
        this._currentWidget = null;
        this.onCurrentChanged();
        this.currentChanged.emit(null);
      }
    });
  }

  /**
   * Dispose of the resources held by the tracker.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    clearSignalData(this);
    this._currentWidget = null;
    this._widgets.clear();
    this._widgets = null;
  }

  /**
   * Find the first widget in the tracker that satisfies a filter function.
   *
   * @param fn The filter function to call on each widget.
   */
  find(fn: (widget: T) => boolean): T {
    let result: T = null;
    this._widgets.forEach(widget => {
      // If a result has already been found, short circuit.
      if (result) {
        return;
      }
      if (fn(widget)) {
        result = widget;
      }
    });
    return result;
  }

  /**
   * Iterate through each widget in the tracker.
   *
   * @param fn The function to call on each widget.
   */
  forEach(fn: (widget: T) => void): void {
    this._widgets.forEach(widget => { fn(widget); });
  }

  /**
   * Check if this tracker has the specified widget.
   */
  has(widget: Widget): boolean {
    return this._widgets.has(widget as any);
  }

  /**
   * Save the restore data for a given widget.
   */
  save(widget: T): void {
    if (!this._restore || !this.has(widget)) {
      return;
    }

    let { namespace, state } = this._restore;
    let widgetName = this._restore.name(widget);
    let oldName = Private.nameProperty.get(widget);
    let newName = widgetName ? `${namespace}:${widgetName}` : null;

    if (oldName && oldName !== newName) {
      state.remove(oldName);
    }

    // Set the name property irrespective of whether the new name is null.
    Private.nameProperty.set(widget, newName);

    if (newName) {
      state.save(newName, this._restore.args(widget));
    }
  }

  /**
   * Syncs the state of the tracker with a widget known to have focus.
   *
   * @param current The currently focused widget.
   *
   * @returns The current widget or `null` if there is none.
   *
   * #### Notes
   * Syncing acts as a gate returning a widget only if it is the current widget.
   */
  sync(current: Widget): T {
    if (this.isDisposed) {
      return;
    }

    if (current && this._widgets.has(current as any)) {
      // If no state change needs to occur, just bail.
      if (this._currentWidget === current) {
        return this._currentWidget;
      }
      this._currentWidget = current as T;
      this.onCurrentChanged();
      this.currentChanged.emit(this._currentWidget);
      return this._currentWidget;
    }

    return null;
  }

  /**
   * Handle the current change event.
   *
   * #### Notes
   * The default implementation is a no-op. This may be reimplemented by
   * subclasses to customize the behavior.
   */
  protected onCurrentChanged(): void {
    /* This is a no-op. */
  }

  private _currentWidget: T = null;
  private _restore: InstanceTracker.IRestoreOptions<T> = null;
  private _widgets = new Set<T>();
}


// Define the signals for the `InstanceTracker` class.
defineSignal(InstanceTracker.prototype, 'currentChanged');


/**
 * A namespace for `InstanceTracker` statics.
 */
export
namespace InstanceTracker {
  /**
   * The state restoration configuration options.
   */
  export
  interface IRestoreOptions<T extends Widget> {
    /**
     * The command to execute when restoring instances.
     */
    command: string;

    /**
     * A function that returns the args needed to restore an instance.
     */
    args: (widget: T) => JSONObject;

    /**
     * A function that returns a unique persistent name for this instance.
     */
    name: (widget: T) => string;

    /**
     * The namespace to occupy in the state database for restoration data.
     */
    namespace: string;

    /**
     * The command registry which holds the restore command.
     */
    registry: CommandRegistry;

    /**
     * The state database instance.
     */
    state: IStateDB;

    /**
     * The point after which it is safe to restore state.
     */
    when: Promise<any> | Array<Promise<any>>;
  }

  /**
   * The instance tracker constructor options.
   */
  export
  interface IOptions<T extends Widget> {
    /**
     * The optional state restoration options.
     */
    restore?: IRestoreOptions<T>;
  }
}


/*
 * A namespace for private data.
 */
namespace Private {
  /**
   * An attached property for a widget's ID in the state database.
   */
  export
  const nameProperty = new AttachedProperty<Widget, string>({ name: 'name' });
}
