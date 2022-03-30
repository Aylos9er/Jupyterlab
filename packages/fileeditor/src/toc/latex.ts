// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { DocumentRegistry, IDocumentWidget } from '@jupyterlab/docregistry';
import { TableOfContents, TableOfContentsFactory } from '@jupyterlab/toc';
import { Widget } from '@lumino/widgets';
import { EditorToCModel, IEditorHeading } from './model';
import { FileEditor } from '../widget';

/**
 * Maps LaTeX section headings to HTML header levels.
 *
 * ## Notes
 *
 * -   As `part` and `chapter` section headings appear to be less common, assign them to heading level 1.
 *
 * @private
 */
const LATEX_LEVELS: { [label: string]: number } = {
  part: 1, // Only available for report and book classes
  chapter: 1, // Only available for report and book classes
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5
};

const SECTIONS = /^\s*\\(section|subsection|subsubsection){(.+)}/;

export class LaTeXToCModel extends EditorToCModel {
  protected getHeadings(): Promise<IEditorHeading[] | null> {
    if (!this.isActive) {
      return Promise.resolve(null);
    }

    // Split the text into lines:
    const lines = this.widget.content.model.value.text.split('\n') as Array<
      string
    >;

    const levels = [];
    let previousLevel = levels.length;
    const headings = new Array<IEditorHeading>();
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(SECTIONS);
      if (match) {
        const level = LATEX_LEVELS[match[1]];
        if (level <= this.configuration.maximalDepth) {
          // Update prefix
          if (level > previousLevel) {
            // Initialize the new level
            levels[level - 1] = 1;
          } else {
            // Increment the current level
            levels[level - 1] += 1;

            // Drop higher levels
            if (level < previousLevel) {
              levels.splice(level);
            }
          }
          previousLevel = level;

          headings.push({
            text: match[2],
            // If the header list skips some level, replace missing elements by 0
            prefix: levels.map(level => level ?? 0).join('.') + '.',
            level,
            line: i
          });
        }
      }
    }
    return Promise.resolve(headings);
  }
}

export class LaTeXToCFactory extends TableOfContentsFactory<
  IDocumentWidget<FileEditor>
> {
  /**
   * Whether the factory can handle the widget or not.
   *
   * @param widget - widget
   * @returns boolean indicating a ToC can be generated
   */
  isApplicable(widget: Widget): boolean {
    const isApplicable = super.isApplicable(widget);

    if (isApplicable) {
      let mime = (widget as any).content?.model?.mimeType;
      return mime && (mime === 'text/x-latex' || mime === 'text/x-stex');
    }
    return false;
  }

  /**
   * Create a new table of contents model for the widget
   *
   * @param widget - widget
   * @param configuration - Table of contents configuration
   * @returns The table of contents model
   */
  protected _createNew(
    widget: IDocumentWidget<FileEditor, DocumentRegistry.IModel>,
    configuration?: TableOfContents.IConfig
  ): LaTeXToCModel {
    return new LaTeXToCModel(widget, configuration);
  }
}
