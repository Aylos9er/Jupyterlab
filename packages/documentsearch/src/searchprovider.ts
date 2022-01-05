// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { IFilter, IFiltersType, ISearchMatch, ISearchProvider } from './tokens';

export abstract class SearchProvider<T extends Widget = Widget>
  implements ISearchProvider<T> {
  constructor(protected widget: T) {
    this._changed = new Signal<SearchProvider<T>, void>(this);
    this._disposed = false;
  }
  /**
   * Signal indicating that something in the search has changed, so the UI should update
   */
  get changed(): Signal<SearchProvider<T>, void> {
    return this._changed;
  }

  /**
   * The current index of the selected match.
   */
  get currentMatchIndex(): number | null {
    return null;
  }

  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * The number of matches.
   */
  get matchesSize(): number | null {
    return null;
  }

  /**
   * Set to true if the widget under search is read-only, false
   * if it is editable.  Will be used to determine whether to show
   * the replace option.
   */
  abstract get isReadOnly(): boolean;

  /**
   * Dispose of the resources held by the search provider.
   *
   * #### Notes
   * If the object's `dispose` method is called more than once, all
   * calls made after the first will be a no-op.
   *
   * #### Undefined Behavior
   * It is undefined behavior to use any functionality of the object
   * after it has been disposed unless otherwise explicitly noted.
   */
  dispose(): void {
    if (this._disposed) {
      return;
    }

    this._disposed = true;
  }

  /**
   * Get an initial query value if applicable so that it can be entered
   * into the search box as an initial query
   *
   * @param searchTarget The widget to be searched
   *
   * @returns Initial value used to populate the search box.
   */
  getInitialQuery(searchTarget: T): string {
    return '';
  }

  /**
   * Get the filters for the given provider.
   *
   * @returns The filters.
   *
   * ### Notes
   * TODO For now it only supports boolean filters (represented with checkboxes)
   */
  getFilters(): { [key: string]: IFilter } {
    return {};
  }

  /**
   * Initialize the search using the provided options.
   *
   * @param query A RegExp to be use to perform the search
   * @param filters Filter parameters to pass to provider
   *
   * @returns A promise that resolves with a list of all matches
   */
  abstract startQuery(query: RegExp, filters: IFiltersType): Promise<void>;

  /**
   * Clears state of a search provider to prepare for startQuery to be called
   * in order to start a new query or refresh an existing one.
   *
   * @returns A promise that resolves when the search provider is ready to
   * begin a new search.
   */
  abstract endQuery(): Promise<void>;

  /**
   * Move the current match indicator to the next match.
   *
   * @returns A promise that resolves once the action has completed.
   */
  abstract highlightNext(): Promise<ISearchMatch | undefined>;

  /**
   * Move the current match indicator to the previous match.
   *
   * @returns A promise that resolves once the action has completed.
   */
  abstract highlightPrevious(): Promise<ISearchMatch | undefined>;

  /**
   * Replace the currently selected match with the provided text
   *
   * @returns A promise that resolves with a boolean indicating whether a replace occurred.
   */
  abstract replaceCurrentMatch(newText: string): Promise<boolean>;

  /**
   * Replace all matches in the notebook with the provided text
   *
   * @returns A promise that resolves with a boolean indicating whether a replace occurred.
   */
  abstract replaceAllMatches(newText: string): Promise<boolean>;

  private _changed: Signal<SearchProvider<T>, void>;
  private _disposed: boolean;
}
