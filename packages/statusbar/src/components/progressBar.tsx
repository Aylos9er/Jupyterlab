// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as React from 'react';
import { fillerItem, progressBarItem } from '../style/progressBar';

/**
 * A namespace for ProgressBar statics.
 */
export namespace ProgressBar {
  /**
   * Props for the ProgressBar.
   */
  export interface IProps {
    /**
     * The current progress percentage, from 0 to 100
     */
    percentage: number;

    /**
     * Width of progress bar in pixel.
     */
    width?: number

    /**
     * Text to show inside progress bar.
     */
    content?: string
  }
}

/**
 * A functional tsx component for a progress bar.
 */
export function ProgressBar(props: ProgressBar.IProps): JSX.Element {
  const {width, ...rest} = props
  return (
    <div className={progressBarItem(width)}>
      <Filler {...rest} contentWidth = {width} />
    </div>
  );
}

/**
 * A namespace for Filler statics.
 */
namespace Filler {
  /**
   * Props for the Filler component.
   */
  export interface IProps {
    /**
     * The current percentage filled, from 0 to 100
     */
    percentage: number;

    /**
     * Width of content inside filler.
     */
    contentWidth?: number

    /**
     * Text to show inside filler.
     */
    content?: string
  }
}

/**
 * A functional tsx component for a partially filled div.
 */
function Filler(props: Filler.IProps) {
  return (
    <div
      className={fillerItem(props.contentWidth)}
      style={{
        width: `${props.percentage}px`
      }}
    >
      <p>{props.content}</p>
    </div>
  );
}
