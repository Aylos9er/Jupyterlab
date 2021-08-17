import React from 'react';
import { progressCircleStyle } from '../style/circleBar';

export namespace ProgressCircle {
  /**
   * Props for the ProgressBar.
   */
  export interface IProps {
    /**
     * The current progress percentage, from 0 to 100
     */
    progress: number;

    width?: number;

    height?: number;
  }
}

export function ProgressCircle(props: ProgressCircle.IProps): JSX.Element {
  const radius = 104;
  const d = (progress: number): string => {
    const angle = Math.max(progress * 3.6, 0.1);
    const rad = (angle * Math.PI) / 180,
      x = Math.sin(rad) * radius,
      y = Math.cos(rad) * -radius,
      mid = angle < 180 ? 1 : 0,
      shape =
        `M 0 0 v -${radius} A ${radius} ${radius} 1 ` +
        mid +
        ' 0 ' +
        x.toFixed(4) +
        ' ' +
        y.toFixed(4) +
        ' z';
    return shape;
  };
  return (
    <div className={progressCircleStyle(props.width, props.height)}>
      <svg viewBox="0 0 250 250">
        <circle
          cx="125"
          cy="125"
          r={`${radius}`}
          stroke="var(--jp-inverse-layout-color3)"
          strokeWidth="20"
          fill="none"
        />
        <path
          transform="translate(125,125) scale(.9)"
          d={d(props.progress)}
          fill={'var(--jp-inverse-layout-color3)'}
        />
      </svg>
    </div>
  );
}
