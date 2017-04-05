// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  IDisposable, DisposableSet
} from '@phosphor/disposable';

import {
  ISignal, Signal
} from '@phosphor/signaling';

import {
  JSONValue
} from '@phosphor/coreutils';

import {
  PathExt
} from './path';

import {
  IObservableMap, ObservableMap
} from './observablemap';

import {
  IObservableJSON, ObservableJSON
} from './observablejson';

import {
  IObservableString, ObservableString
} from './observablestring';

import {
  IObservableVector, ObservableVector
} from './observablevector';

import {
  IObservableUndoableVector, ObservableUndoableVector
} from './undoablevector';


/**
 * String type annotations for Observable objects that can be
 * created and placed in the IModelDB interface.
 */
export
type ObservableType = 'Map' | 'Vector' | 'String' | 'Value';

/**
 * Base interface for Observable objects.
 */
export
interface IObservable extends IDisposable {
  /**
   * The type of this object.
   */
  readonly type: ObservableType;
}

/**
 * Interface for an Observable object that represents
 * an opaque JSON value.
 */
export
interface IObservableValue extends IObservable {
  /**
   * The type of this object.
   */
  type: 'Value';

  /**
   * The changed signal.
   */
  readonly changed: ISignal<IObservableValue, ObservableValue.IChangedArgs>;

  /**
   * Get the current value.
   */
  get(): JSONValue;

  /**
   * Set the value.
   */
  set(value: JSONValue): void;
}

/**
 * An interface for a path based database for
 * creating and storing values, which is agnostic
 * to the particular type of store in the backend.
 */
export
interface IModelDB extends IDisposable {
  /**
   * The base path for the `IModelDB`. This is prepended
   * to all the paths that are passed in to the member
   * functions of the object.
   */
  readonly basePath: string;

  /**
   * Whether the database has been disposed.
   */
  readonly isDisposed: boolean;

  /**
   * Get a value for a path.
   *
   * @param path: the path for the object.
   *
   * @returns an `IObservable`.
   */
  get(path: string): IObservable;

  /**
   * Whether the `IModelDB` has an object at this path.
   *
   * @param path: the path for the object.
   *
   * @returns a boolean for whether an object is at `path`.
   */
  has(path: string): boolean;

  /**
   * Create a string and insert it in the database.
   *
   * @param path: the path for the string.
   *
   * @returns the string that was created.
   */
  createString(path: string): IObservableString;

  /**
   * Create a vector and insert it in the database.
   *
   * @param path: the path for the vector.
   *
   * @returns the vector that was created.
   *
   * #### Notes
   * The vector can only store objects that are simple
   * JSON Objects and primitives.
   */
  createVector<T extends JSONValue>(path: string): IObservableVector<T>;

  /**
   * Create an undoable vector and insert it in the database.
   *
   * @param path: the path for the vector.
   *
   * @returns the vector that was created.
   *
   * #### Notes
   * The vector can only store objects that are simple
   * JSON Objects and primitives.
   */
  createUndoableVector<T extends JSONValue>(path: string): IObservableUndoableVector<T>;

  /**
   * Create a map and insert it in the database.
   *
   * @param path: the path for the map.
   *
   * @returns the map that was created.
   *
   * #### Notes
   * The map can only store objects that are simple
   * JSON Objects and primitives.
   */
  createMap<T extends JSONValue>(path: string): IObservableMap<T>;

  /**
   * Create an `IObservableJSON` and insert it in the database.
   *
   * @param path: the path for the object.
   *
   * @returns the object that wsa created.
   */
  createJSON(path: string): IObservableJSON;

  /**
   * Create an opaque value and insert it in the database.
   *
   * @param path: the path for the value.
   *
   * @returns the value that was created.
   */
  createValue(path: string): IObservableValue;

  /**
   * Create a view onto a subtree of the model database.
   *
   * @param basePath: the path for the root of the subtree.
   *
   * @returns an `IModelDB` with a view onto the original
   *   `IModelDB`, with `basePath` prepended to all paths.
   */
  view(basePath: string): IModelDB;

  /**
   * Set a value at a path.
   */
  set(path: string, value: IObservable): void;

  /**
   * Dispose of the resources held by the database.
   */
  dispose(): void;
}

/**
 * A concrete implementation of an `IObservableValue`.
 */
export
class ObservableValue implements IObservableValue {
  /**
   * Constructor for the value.
   *
   * @param initialValue: the starting value for the `ObservableValue`.
   */
  constructor(initialValue?: JSONValue) {
    this._value = initialValue;
  }

  /**
   * The observable type.
   */
  readonly type: 'Value';

  /**
   * Whether the value has been disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * The changed signal.
   */
  get changed(): ISignal<this, ObservableValue.IChangedArgs> {
    return this._changed;
  }

  /**
   * Get the current value.
   */
  get(): JSONValue {
    return this._value;
  }

  /**
   * Set the current value.
   */
  set(value: JSONValue): void {
    let oldValue = this._value;
    this._value = value;
    this._changed.emit({
      oldValue: oldValue,
      newValue: value
    });
  }

  /**
   * Dispose of the resources held by the value.
   */
  dispose(): void {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
    this._value = null;
  }

  private _value: JSONValue = null;
  private _changed = new Signal<ObservableValue, ObservableValue.IChangedArgs>(this);
  private _isDisposed = false;
}

/**
 * The namespace for the `ObservableValue` class statics.
 */
export
namespace ObservableValue {
  /**
   * The changed args object emitted by the `IObservableValue`.
   */
  export
  class IChangedArgs {
    /**
     * The old value.
     */
    oldValue: JSONValue;

    /**
     * The new value.
     */
    newValue: JSONValue;
  }
}


/**
 * A concrete implementation of an `IModelDB`.
 */
export
class ModelDB implements IModelDB {
  /**
   * Constructor for the `ModelDB`.
   */
  constructor(options: ModelDB.ICreateOptions = {}) {
    this._basePath = options.basePath || '';
    if(options.baseDB) {
      this._db = options.baseDB;
    } else {
      this._db = new ObservableMap<IObservable>();
      this._toDispose = true;
    }
  }

  /**
   * The base path for the `ModelDB`. This is prepended
   * to all the paths that are passed in to the member
   * functions of the object.
   */
  get basePath(): string {
    return this._basePath;
  }

  /**
   * Whether the database is disposed.
   */
  get isDisposed(): boolean {
    return this._db === null;
  }

  /**
   * Get a value for a path.
   *
   * @param path: the path for the object.
   *
   * @returns an `IObservable`.
   */
  get(path: string): IObservable {
    return this._db.get(this._resolvePath(path));
  }

  /**
   * Whether the `IModelDB` has an object at this path.
   *
   * @param path: the path for the object.
   *
   * @returns a boolean for whether an object is at `path`.
   */
  has(path: string): boolean {
    return this._db.has(this._resolvePath(path));
  }

  /**
   * Create a string and insert it in the database.
   *
   * @param path: the path for the string.
   *
   * @returns the string that was created.
   */
  createString(path: string): IObservableString {
    let str = new ObservableString();
    this._disposables.add(str);
    this.set(path, str);
    return str;
  }

  /**
   * Create a vector and insert it in the database.
   *
   * @param path: the path for the vector.
   *
   * @returns the vector that was created.
   *
   * #### Notes
   * The vector can only store objects that are simple
   * JSON Objects and primitives.
   */
  createVector(path: string): IObservableVector<JSONValue> {
    let vec = new ObservableVector<JSONValue>();
    this._disposables.add(vec);
    this.set(path, vec);
    return vec;
  }

  /**
   * Create an undoable vector and insert it in the database.
   *
   * @param path: the path for the vector.
   *
   * @returns the vector that was created.
   *
   * #### Notes
   * The vector can only store objects that are simple
   * JSON Objects and primitives.
   */
  createUndoableVector(path: string): IObservableUndoableVector<JSONValue> {
    let vec = new ObservableUndoableVector<JSONValue>(
      new ObservableUndoableVector.IdentitySerializer());
    this._disposables.add(vec);
    this.set(path, vec);
    return vec;
  }

  /**
   * Create a map and insert it in the database.
   *
   * @param path: the path for the map.
   *
   * @returns the map that was created.
   *
   * #### Notes
   * The map can only store objects that are simple
   * JSON Objects and primitives.
   */
  createMap(path: string): IObservableMap<JSONValue> {
    let map = new ObservableMap<JSONValue>();
    this._disposables.add(map);
    this.set(path, map);
    return map;
  }

  /**
   * Create an `IObservableJSON` and insert it in the database.
   *
   * @param path: the path for the object.
   *
   * @returns the object that wsa created.
   */
  createJSON(path: string): IObservableJSON {
    let json = new ObservableJSON();
    this._disposables.add(json);
    this.set(path, json);
    return json;
  }

  /**
   * Create an opaque value and insert it in the database.
   *
   * @param path: the path for the value.
   *
   * @returns the value that was created.
   */
  createValue(path: string): IObservableValue {
    let val = new ObservableValue();
    this._disposables.add(val);
    this.set(path, val);
    return val;
  }

  /**
   * Create a view onto a subtree of the model database.
   *
   * @param basePath: the path for the root of the subtree.
   *
   * @returns an `IModelDB` with a view onto the original
   *   `IModelDB`, with `basePath` prepended to all paths.
   */
  view(basePath: string): ModelDB {
    return new ModelDB({basePath, baseDB: this});
  }

  /**
   * Set a value at a path.
   */
  set(path: string, value: IObservable): void {
    this._db.set(this._resolvePath(path), value);
  }

  /**
   * Dispose of the resources held by the database.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    let db = this._db;
    this._db = null;

    if (this._toDispose) {
      db.dispose();
    }
    this._disposables.dispose();
  }

  /**
   * Compute the fully resolved path for a path argument.
   */
  private _resolvePath(path: string): string {
    if (this._basePath) {
      path = this._basePath + '/' + path;
    }
    return PathExt.normalize(path)
  }

  private _basePath: string;
  private _db: IModelDB | ObservableMap<IObservable> = null;
  private _toDispose = true;
  private _disposables = new DisposableSet();
}

/**
 * A namespace for the `ModelDB` class statics.
 */
export
namespace ModelDB {
  /**
   * Options for creating a `ModelDB` object.
   */
  export
  interface ICreateOptions {
    /**
     * The base path to prepend to all the path arguments.
     */
    basePath?: string;

    /**
     * A ModelDB to use as the store for this
     * ModelDB. If none is given, it uses its own store.
     */
    baseDB?: ModelDB;
  }
}
