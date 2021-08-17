// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ISessionContext } from '@jupyterlab/apputils';

import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import React from 'react';
import { interactiveItem, ProgressCircle } from '@jupyterlab/statusbar';

import {
  circleIcon,
  LabIcon,
  offlineBoltIcon,
  VDomModel,
  VDomRenderer
} from '@jupyterlab/ui-components';

import { Notebook } from './widget';
import { KernelMessage } from '@jupyterlab/services';

/**
 * A react functional component for rendering execution indicator.
 */
export function ExecutionIndicatorComponent(
  props: ExecutionIndicatorComponent.IProps
): React.ReactElement<ExecutionIndicatorComponent.IProps> {
  const translator = props.translator || nullTranslator;
  const trans = translator.load('jupyterlab');
  const state = props.state;
  const showOnToolBar = props.displayOption.showOnToolBar;
  const showProgress = props.displayOption.showProgress;
  const tooltipClass = showOnToolBar ? 'down' : 'up';
  const emptyDiv = <div></div>;

  if (!state) {
    return emptyDiv;
  }

  const kernelStatus = state.kernelStatus;
  const circleIconProps: LabIcon.IProps = {
    alignSelf: 'normal',
    height: '24px'
  };
  const time = state.totalTime;

  const scheduledCellNumber = state.scheduledCellNumber || 0;
  const remainingCellNumber = state.scheduledCell.size || 0;
  const executedCellNumber = scheduledCellNumber - remainingCellNumber;
  let percentage = (100 * executedCellNumber) / scheduledCellNumber;
  let displayClass = showProgress ? '' : 'hidden';
  if (!showProgress && percentage < 100) {
    percentage = 0;
  }

  const progressBar = (percentage: number) => (
    <ProgressCircle progress={percentage} width={16} height={24} />
  );
  const titleFactory = (prefix: string, title: string) =>
    trans.__(`${prefix} ${title[0].toUpperCase() + title.slice(1)}`);

  const reactElement = (
    status: string,
    circle: JSX.Element,
    popup: JSX.Element[]
  ): JSX.Element => (
    <div
      className={'jp-Notebook-ExecutionIndicator'}
      title={showProgress ? '' : titleFactory('Kernel', status)}
    >
      {circle}
      <div
        className={`jp-Notebook-ExecutionIndicator-tooltip ${tooltipClass} ${displayClass}`}
      >
        <span> {titleFactory('Kernel status:', status)} </span>
        {popup}
      </div>
    </div>
  );

  if (
    state.kernelStatus === 'connecting' ||
    state.kernelStatus === 'disconnected' ||
    state.kernelStatus === 'unknown'
  ) {
    return reactElement(
      kernelStatus,
      <offlineBoltIcon.react {...circleIconProps} />,
      []
    );
  }
  if (
    state.kernelStatus === 'starting' ||
    state.kernelStatus === 'terminating' ||
    state.kernelStatus === 'restarting' ||
    state.kernelStatus === 'initializing'
  ) {
    return reactElement(
      kernelStatus,
      <circleIcon.react {...circleIconProps} />,
      []
    );
  }

  if (state.executionStatus === 'busy') {
    return reactElement('busy', progressBar(percentage), [
      <span key={0}>
        {trans.__(
          `Executed ${executedCellNumber}/${scheduledCellNumber} cells`
        )}
      </span>,
      <span key={1}> {trans.__(`Total time: ${time} seconds`)} </span>
    ]);
  } else {
    if (time === 0) {
      return reactElement('idle', progressBar(100), []);
    } else {
      return reactElement('idle', progressBar(100), [
        <span key={0}>
          {trans.__(`Executed ${scheduledCellNumber} cells`)}
        </span>,
        <span key={1}> {trans.__(`Total time: ${time} seconds`)} </span>
      ]);
    }
  }
}

/**
 * A namespace for ExecutionIndicatorComponent statics.
 */
namespace ExecutionIndicatorComponent {
  /**
   * Props for the execution status component.
   */
  export interface IProps {
    /**
     * Display option for progress bar and elapsed time.
     */
    displayOption: Private.DisplayOption;

    /**
     * Execution state of selected notebook.
     */
    state?: Private.IExecutionState;

    /**
     * The application language translator.
     */
    translator?: ITranslator;
  }
}

/**
 * A VDomRenderer widget for displaying the execution status.
 */
export class ExecutionIndicator extends VDomRenderer<ExecutionIndicator.Model> {
  /**
   * Construct the kernel status widget.
   */
  constructor(translator?: ITranslator, showProgress: boolean = true) {
    super(new ExecutionIndicator.Model(translator));
    this.translator = translator || nullTranslator;
    this.addClass(interactiveItem);
  }

  /**
   * Render the execution status item.
   */
  render(): JSX.Element | null {
    if (this.model === null) {
      return null;
    } else {
      const nb = this.model.currentNotebook;

      if (!nb) {
        return (
          <ExecutionIndicatorComponent
            displayOption={this.model.displayOption}
            state={undefined}
            translator={this.translator}
          />
        );
      }
      return (
        <ExecutionIndicatorComponent
          displayOption={this.model.displayOption}
          state={this.model.executionState(nb)}
          translator={this.translator}
        />
      );
    }
  }

  private translator: ITranslator;
}

/**
 * A namespace for ExecutionIndicator statics.
 */
export namespace ExecutionIndicator {
  /**
   * A VDomModel for the execution status indicator.
   */
  export class Model extends VDomModel {
    constructor(translator?: ITranslator) {
      super();
      translator = translator || nullTranslator;
      this._displayOption = { showOnToolBar: true, showProgress: true };
    }

    /**
     * Attach a notebook with session context to model in order to keep
     * track of multiple notebooks. If a session context is already
     * attached, only set current activated notebook to input.
     *
     * @param data - The  notebook and session context to be attached to model
     */
    attachNotebook(
      data: { content?: Notebook; context?: ISessionContext } | null
    ): void {
      if (data && data.content && data.context) {
        const nb = data.content;
        const context = data.context;
        this._currentNotebook = nb;
        if (!this._notebookExecutionProgress.has(nb)) {
          this._notebookExecutionProgress.set(nb, {
            executionStatus: 'idle',
            kernelStatus: 'idle',
            totalTime: 0,
            interval: 0,
            timeout: 0,
            scheduledCell: new Set<string>(),
            scheduledCellNumber: 0,
            needReset: true
          });

          const state = this._notebookExecutionProgress.get(nb);
          context.statusChanged.connect(ctx => {
            if (state) {
              state.kernelStatus = ctx.kernelDisplayStatus;
            }
            this.stateChanged.emit(void 0);
          }, this);

          context.connectionStatusChanged.connect(ctx => {
            if (state) {
              state.kernelStatus = ctx.kernelDisplayStatus;
            }
            this.stateChanged.emit(void 0);
          }, this);
          context.kernelChanged.connect((_, kernelData) => {
            if (state) {
              this._resetTime(state);
              this.stateChanged.emit(void 0);
              if (kernelData.newValue) {
                kernelData.newValue.anyMessage.connect((sender, msg) => {
                  const message = msg.msg;
                  const msgId = message.header.msg_id;
                  if (
                    KernelMessage.isCommMsgMsg(message) &&
                    message.content.data['method']
                  ) {
                    const method = message.content.data['method'];
                    if (method !== 'request_state' && method !== 'update') {
                      this._cellScheduledCallback(nb, msgId);
                    }
                  } else if (message.header.msg_type === 'execute_request') {
                    this._cellScheduledCallback(nb, msgId);
                  } else if (
                    KernelMessage.isStatusMsg(message) &&
                    message.content.execution_state === 'idle'
                  ) {
                    const parentId = (message.parent_header as KernelMessage.IHeader)
                      .msg_id;
                    this._cellExecutedCallback(nb, parentId);
                  }
                });
              }
            }
          });
        }
      }
    }

    /**
     * The current activated notebook in model.
     */
    get currentNotebook(): Notebook | null {
      return this._currentNotebook;
    }

    /**
     * The display options for progress bar and elapsed time.
     */
    get displayOption(): Private.DisplayOption {
      return this._displayOption;
    }

    /**
     * Set the display options for progress bar and elapsed time.
     *
     * @param options - Options to be used
     */
    set displayOption(options: Private.DisplayOption) {
      this._displayOption = options;
    }

    /**
     * Get the execution state associated with a notebook.
     *
     * @param nb - The notebook used to identify execution
     * state.
     *
     * @return - The associated execution state.
     */
    public executionState(nb: Notebook): Private.IExecutionState | undefined {
      return this._notebookExecutionProgress.get(nb);
    }

    /**
     * The slot connected to `NotebookActions.executed` signal, it is
     * used to keep track number of executed cell or Comm custom message and the status
     * of kernel.
     *
     * @param  nb - The notebook which contains the executed code
     * cell.
     * @param  msg_id - The executed code cell or id of comm message.
     *
     * ### Note
     *
     * To keep track of cells executed under 1 second,
     * the execution state is marked as `needReset` 1 second after executing
     * these cells. This `Timeout` will be cleared if there is any cell
     * scheduled after that.
     */
    private _cellExecutedCallback(nb: Notebook, msg_id: string): void {
      const state = this._notebookExecutionProgress.get(nb);
      if (state && state.scheduledCell.has(msg_id)) {
        state.scheduledCell.delete(msg_id);
        if (state.scheduledCell.size === 0) {
          state.executionStatus = 'idle';
          clearInterval(state.interval);
          state.timeout = window.setTimeout(() => {
            state.needReset = true;
          }, 1000);
          this.stateChanged.emit(void 0);
        }
      }
    }

    /**
     * The slot connected to `NotebookActions.executionScheduled` signal, it is
     * used to keep track number of scheduled cell and the status
     * or kernel.
     *
     * @param  nb - The notebook which contains the scheduled code or id of comm message.
     * cell
     * @param  msg_id - The scheduled code cell.
     */
    private _cellScheduledCallback(nb: Notebook, msg_id: string): void {
      const state = this._notebookExecutionProgress.get(nb);

      if (state && !state.scheduledCell.has(msg_id)) {
        if (state.needReset) {
          this._resetTime(state);
        }
        state.scheduledCell.add(msg_id);
        state.scheduledCellNumber += 1;
        if (state.executionStatus !== 'busy') {
          state.executionStatus = 'busy';
          clearTimeout(state.timeout);
          this._tick(state);
          state.interval = window.setInterval(() => {
            this._tick(state);
          }, 1000);
        }
      }
    }

    /**
     * Increment the executed time of input execution state
     * and emit `stateChanged` signal to re-render the indicator.
     *
     * @param  data - the state to be updated.
     */
    private _tick(data: Private.IExecutionState): void {
      data.totalTime += 1;

      this.stateChanged.emit(void 0);
    }

    /**
     * Reset the input execution state.
     *
     * @param  data - the state to be rested.
     */
    private _resetTime(data: Private.IExecutionState): void {
      data.totalTime = 0;
      data.scheduledCellNumber = 0;
      data.executionStatus = 'idle';
      data.scheduledCell = new Set<string>();
      clearTimeout(data.timeout);
      clearInterval(data.interval);
      data.needReset = false;
    }

    /**
     * The option to show the indicator on status bar or toolbar.
     */
    private _displayOption: Private.DisplayOption;

    /**
     * Current activated notebook.
     */
    private _currentNotebook: Notebook;

    /**
     * A weak map to hold execution status of multiple notebooks.
     */
    private _notebookExecutionProgress = new WeakMap<
      Notebook,
      Private.IExecutionState
    >();
  }
}

/**
 * A namespace for module-private data.
 */
namespace Private {
  export interface IExecutionState {
    /**
     * Execution status of kernel, this status is deducted from the
     * number of scheduled code cells.
     */
    executionStatus: string;

    /**
     * Current status of kernel.
     */
    kernelStatus: ISessionContext.KernelDisplayStatus;

    /**
     * Total execution time.
     */
    totalTime: number;

    /**
     * Id of `setInterval`, it is used to start / stop the elapsed time
     * counter.
     */
    interval: number;

    /**
     * Id of `setTimeout`, it is used to create / clear the state
     * resetting request.
     */
    timeout: number;

    /**
     * Set of messages scheduled for executing, `executionStatus` is set
     *  to `idle if the length of this set is 0 and to `busy` otherwise.
     */
    scheduledCell: Set<string>;

    /**
     * Total number of cells requested for executing, it is used to compute
     * the execution progress in progress bar.
     */
    scheduledCellNumber: number;

    /**
     * Flag to reset the execution state when a code cell is scheduled for
     * executing.
     */
    needReset: boolean;
  }

  export type DisplayOption = {
    /**
     * The option to show the indicator on status bar or toolbar.
     */
    showOnToolBar: boolean;

    /**
     * The option to show the execution progress inside kernel
     * status circle.
     */
    showProgress: boolean;
  };
}
