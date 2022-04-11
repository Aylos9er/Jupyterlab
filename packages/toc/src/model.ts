// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { VDomModel } from '@jupyterlab/ui-components';
import { JSONExt } from '@lumino/coreutils';
import { ISignal, Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { TableOfContents } from './tokens';

/**
 * Abstract table of contents model.
 */
export abstract class TableOfContentsModel<
    H extends TableOfContents.IHeading,
    T extends Widget = Widget
  >
  extends VDomModel
  implements TableOfContents.IModel<H> {
  /**
   * Constructor
   *
   * @param widget The widget to search in
   * @param configuration Default model configuration
   */
  constructor(protected widget: T, configuration?: TableOfContents.IConfig) {
    super();
    this._activeHeading = null;
    this._activeHeadingChanged = new Signal<
      TableOfContentsModel<H, T>,
      H | null
    >(this);
    this._collapseChanged = new Signal<TableOfContentsModel<H, T>, H>(this);
    this._configuration = configuration ?? { ...TableOfContents.defaultConfig };
    this._headings = new Array<H>();
    this._headingsChanged = new Signal<TableOfContentsModel<H, T>, void>(this);
    this._isActive = false;
    this._isRefreshing = false;
    this._needsRefreshing = false;
  }

  /**
   * Current active entry.
   *
   * @returns table of contents active entry
   */
  get activeHeading(): H | null {
    return this._activeHeading;
  }
  set activeHeading(heading: H | null) {
    if (this._activeHeading !== heading) {
      this._activeHeading = heading;
      this.stateChanged.emit();
      this._activeHeadingChanged.emit(heading);
    }
  }

  /**
   * Signal emitted when the active heading changes.
   */
  get activeHeadingChanged(): ISignal<TableOfContents.IModel<H>, H | null> {
    return this._activeHeadingChanged;
  }

  /**
   * Signal emitted when a table of content section collapse state changes.
   */
  get collapseChanged(): ISignal<TableOfContents.IModel<H>, H> {
    return this._collapseChanged;
  }

  /**
   * Model configuration
   */
  get configuration(): TableOfContents.IConfig {
    return this._configuration;
  }

  /**
   * Type of document supported by the model.
   *
   * #### Notes
   * A `data-document-type` attribute with this value will be set
   * on the tree view `.jp-TableOfContents-content[data-document-type="..."]`
   */
  abstract readonly documentType: string;

  /**
   * List of headings.
   *
   * @returns table of contents list of headings
   */
  get headings(): H[] {
    return this._headings;
  }

  /**
   * Signal emitted when the headings changes.
   */
  get headingsChanged(): ISignal<TableOfContents.IModel<H>, void> {
    return this._headingsChanged;
  }

  /**
   * Whether the model is active or not.
   *
   * #### Notes
   * An active model means it is displayed in the table of contents.
   * This can be used by subclass to limit updating the headings.
   */
  get isActive(): boolean {
    return this._isActive;
  }
  set isActive(v: boolean) {
    this._isActive = v;
    // Refresh on activation expect if it is always active
    //  => a ToC model is always active e.g. when displaying numbering in the document
    if (this._isActive && !this.isAlwaysActive) {
      this.refresh().catch(reason => {
        console.error('Failed to refresh ToC model.', reason);
      });
    }
  }

  /**
   * Whether the model gets updated even if the table of contents panel
   * is hidden or not.
   *
   * #### Notes
   * For example, ToC models use to add title numbering will
   * set this to true.
   */
  protected get isAlwaysActive(): boolean {
    return false;
  }

  /**
   * Model configuration setter.
   *
   * @param c New configuration
   */
  setConfiguration(c: Partial<TableOfContents.IConfig>): void {
    const newConfiguration = { ...this._configuration, ...c };
    if (!JSONExt.deepEqual(this._configuration, newConfiguration)) {
      this._configuration = newConfiguration as TableOfContents.IConfig;
      this.refresh();
    }
  }

  /**
   * List of configuration options supported by the model.
   */
  get supportedOptions(): (keyof TableOfContents.IConfig)[] {
    return ['maximalDepth'];
  }

  /**
   * Document title
   */
  get title(): string | undefined {
    return this._title;
  }
  set title(v: string | undefined) {
    if (v !== this._title) {
      this._title = v;
      this.stateChanged.emit();
    }
  }

  /**
   * Abstract function that will produce the headings for a document.
   *
   * @returns The list of new headings or `null` if nothing needs to be updated.
   */
  protected abstract getHeadings(): Promise<H[] | null>;

  /**
   * Refresh the headings list.
   */
  async refresh(): Promise<void> {
    if (this._isRefreshing) {
      // Schedule a refresh if one is in progress
      this._needsRefreshing = true;
      return Promise.resolve();
    }

    this._isRefreshing = true;
    try {
      const newHeadings = await this.getHeadings();

      if (this._needsRefreshing) {
        this._needsRefreshing = false;
        this._isRefreshing = false;
        return this.refresh();
      }

      if (
        newHeadings &&
        !Private.areHeadingsEqual(newHeadings, this._headings)
      ) {
        this._headings = newHeadings;
        this.stateChanged.emit();
        this._headingsChanged.emit();
      }
    } finally {
      this._isRefreshing = false;
    }
  }

  /**
   * Callback on heading collapse.
   */
  toggleCollapse(heading: H): void {
    heading.collapsed = !heading.collapsed;
    this.stateChanged.emit();
    this._collapseChanged.emit(heading);
  }

  private _activeHeading: H | null;
  private _activeHeadingChanged: Signal<TableOfContentsModel<H, T>, H | null>;
  private _collapseChanged: Signal<TableOfContentsModel<H, T>, H>;
  private _configuration: TableOfContents.IConfig;
  private _headings: H[];
  private _headingsChanged: Signal<TableOfContentsModel<H, T>, void>;
  private _isActive: boolean;
  private _isRefreshing: boolean;
  private _needsRefreshing: boolean;
  private _title?: string;
}

/**
 * Private functions namespace
 */
namespace Private {
  /**
   * Test if two list of headings are equal or not.
   *
   * @param headings1 First list of headings
   * @param headings2 Second list of headings
   * @returns Whether the array are identical or not.
   */
  export function areHeadingsEqual(
    headings1: TableOfContents.IHeading[],
    headings2: TableOfContents.IHeading[]
  ): boolean {
    if (headings1.length === headings2.length) {
      for (let i = 0; i < headings1.length; i++) {
        if (
          headings1[i].level !== headings2[i].level ||
          headings1[i].text !== headings2[i].text ||
          headings1[i].prefix !== headings2[i].prefix
        ) {
          return false;
        }
      }
      return true;
    }

    return false;
  }
}
