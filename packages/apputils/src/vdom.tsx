// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IDisposable } from '@phosphor/disposable';

import { Message, MessageLoop } from '@phosphor/messaging';

import { ISignal, Signal } from '@phosphor/signaling';

import { Widget } from '@phosphor/widgets';

import { mapSignal, filterSignal } from '@jupyterlab/coreutils/src/signals';

import * as React from 'react';

import * as ReactDOM from 'react-dom';

/**
 * An abstract class for a Phosphor widget which renders a React component.
 */
export abstract class ReactWidget extends Widget {
  /**
   * Render the content of this widget using the virtual DOM.
   *
   * This method will be called anytime the widget needs to be rendered, which
   * includes layout triggered rendering.
   *
   * Subclasses should define this method and return the root React nodes here.
   */
  protected abstract render():
    | Array<React.ReactElement<any>>
    | React.ReactElement<any>;

  /**
   * Called to update the state of the widget.
   *
   * The default implementation of this method triggers
   * VDOM based rendering by calling the `renderDOM` method.
   */
  protected onUpdateRequest(msg: Message): void {
    this.renderPromise = this.renderDOM();
  }

  /**
   * Called after the widget is attached to the DOM
   */
  protected onAfterAttach(msg: Message): void {
    // Make *sure* the widget is rendered.
    MessageLoop.sendMessage(this, Widget.Msg.UpdateRequest);
  }

  /**
   * Called before the widget is detached from the DOM.
   */
  protected onBeforeDetach(msg: Message): void {
    // Unmount the component so it can tear down.
    ReactDOM.unmountComponentAtNode(this.node);
  }

  /**
   * Render the React nodes to the DOM.
   *
   * @returns a promise that resolves when the rendering is done.
   */
  private renderDOM(): Promise<void> {
    return new Promise<void>(resolve => {
      let vnode = this.render();
      // Split up the array/element cases so type inference chooses the right
      // signature.
      if (Array.isArray(vnode)) {
        ReactDOM.render(vnode, this.node, resolve);
      } else {
        ReactDOM.render(vnode, this.node, resolve);
      }
    });
  }

  // Set whenever a new render is triggered and resolved when it is finished.
  renderPromise?: Promise<void>;
}

/**
 * An abstract ReactWidget with a model.
 */
export abstract class VDomRenderer<
  T extends VDomRenderer.IModel | null
> extends ReactWidget {
  /**
   * A signal emitted when the model changes.
   */
  get modelChanged(): ISignal<this, void> {
    return this._modelChanged;
  }

  /**
   * Set the model and fire changed signals.
   */
  set model(newValue: T | null) {
    if (this._model === newValue) {
      return;
    }

    if (this._model) {
      this._model.stateChanged.disconnect(this.update, this);
    }
    this._model = newValue;
    if (newValue) {
      newValue.stateChanged.connect(
        this.update,
        this
      );
    }
    this.update();
    this._modelChanged.emit(void 0);
  }

  /**
   * Get the current model.
   */
  get model(): T | null {
    return this._model;
  }

  /**
   * Dispose this widget.
   */
  dispose() {
    this._model = null;
    super.dispose();
  }

  private _model: T | null;
  private _modelChanged = new Signal<this, void>(this);
}

/**
 * Phosphor widget that renders React Element(s).
 *
 * All messages will re-render the element.
 */
export class ReactElementWidget extends ReactWidget {
  /**
   * Creates a Phosphor widget that renders the element(s) `es`.
   */
  constructor(
    es: Array<React.ReactElement<any>> | React.ReactElement<any> | null
  ) {
    super();
    this._es = es;
  }

  render(): Array<React.ReactElement<any>> | React.ReactElement<any> | null {
    return this._es;
  }

  private _es: Array<React.ReactElement<any>> | React.ReactElement<any> | null;
}

/**
 * Props for the RenderSignal component
 */
export interface IRenderSignalProps {
  /**
   * Phosphor signal to connect to.
   */

  signal: ISignal<any, JSX.Element>;
  /**
   * Initial element.
   */
  initial: JSX.Element;
}

/**
 * State for the RenderSignal component
 */
export interface IRenderSignalState {
  element: JSX.Element;
}

/**
 * RenderSignal allows you to render a Signal of JSX elements.
 *
 * If you have some existing Phosphor Signal and want to make a
 * React element that updates based on it, you can use the
 * utilities in `./signals.ts` to map that signal to elements
 * and then render them.
 */
export class RenderSignal extends React.Component<
  IRenderSignalProps,
  IRenderSignalState
> {
  constructor(props: IRenderSignalProps) {
    super(props);
    this.state = { element: props.initial };
  }

  componentDidMount() {
    this.props.signal.connect(this.slot);
  }

  componentWillUnmount() {
    this.props.signal.disconnect(this.slot);
  }

  private slot = (sender: any, args: JSX.Element) => {
    this.setState({ element: args });
  };

  render() {
    return this.state.element;
  }
}

/**
 * Props for the UseSignal component
 */
export interface IUseSignalProps<SENDER, ARGS> {
  /**
   * Phosphor signal to connect to.
   */

  signal: ISignal<SENDER, ARGS>;
  /**
   * Initial value to use for the sender, used before the signal emits a value.
   * If not provided, initial sender will be undefined
   */
  sender?: SENDER;
  /**
   * Initial value to use for the args, used before the signal emits a value.
   * If not provided, initial args will be undefined.
   */
  args?: ARGS;
  /**
   * Function mapping the last signal value or inital values to an element to render.
   */

  children: (sender?: SENDER, args?: ARGS) => JSX.Element;
  /**
   * Given the last signal value, should return whether to update the state or not.
   *
   * The default unconditionally returns `true`, so you only have to override if you want
   * to skip some updates.
   */

  shouldUpdate?: (sender: SENDER, args: ARGS) => boolean;
}

/**
 * UseSignal provides a way to hook up a Phosphor signal to a React element,
 * so that the element is re-rendered every time the signal fires.
 *
 * It is implemented through the "render props" technique, using the `children`
 * prop as a function to render, so that it can be used either as a prop or as a child
 * of this element
 * https://reactjs.org/docs/render-props.html
 *
 *
 * Example as child:
 *
 * ```
 * function LiveButton(isActiveSignal: ISignal<any, boolean>) {
 *  return (
 *    <UseSignal signal={isActiveSignal} initialArgs={True}>
 *     {(_, isActive) => <Button isActive={isActive}>}
 *    </UseSignal>
 *  )
 * }
 * ```
 *
 * Example as prop:
 *
 * ```
 * function LiveButton(isActiveSignal: ISignal<any, boolean>) {
 *  return (
 *    <UseSignal
 *      signal={isActiveSignal}
 *      initialArgs={True}
 *      children={(_, isActive) => <Button isActive={isActive}>}
 *    />
 *  )
 * }
 */
export function UseSignal<SENDER, ARGS>(props: IUseSignalProps<SENDER, ARGS>) {
  const filteredSignal = filterSignal(
    props.signal,
    props.shouldUpdate || (() => true)
  );
  const elSignal = mapSignal(filteredSignal, (_, [sender, args]) =>
    props.children(sender, args)
  );
  const initial = props.children(props.sender, props.args);
  return <RenderSignal signal={elSignal} initial={initial} />;
}

/**
 * The namespace for VDomRenderer statics.
 */
export namespace VDomRenderer {
  /**
   * An interface for a model to be used with vdom rendering.
   */
  export interface IModel extends IDisposable {
    /**
     * A signal emitted when any model state changes.
     */
    readonly stateChanged: ISignal<this, void>;
  }
}

/**
 * Concrete implementation of VDomRenderer model.
 */
export class VDomModel implements VDomRenderer.IModel {
  /**
   * A signal emitted when any model state changes.
   */
  readonly stateChanged = new Signal<this, void>(this);

  /**
   * Test whether the model is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose the model.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    Signal.clearData(this);
  }

  private _isDisposed = false;
}
