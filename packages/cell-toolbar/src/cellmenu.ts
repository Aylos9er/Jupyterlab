import { ToolbarButton } from '@jupyterlab/apputils';
import { LabIcon } from '@jupyterlab/ui-components';
import { each } from '@lumino/algorithm';
import { CommandRegistry } from '@lumino/commands';
import { PanelLayout, Widget } from '@lumino/widgets';
import { ICellMenuItem } from './tokens';

const CELL_MENU_CLASS = 'jp-cell-menu';

/**
 * Toolbar icon menu container
 */
export class CellMenu extends Widget {
  constructor(commands: CommandRegistry, items: ICellMenuItem[]) {
    super();
    this._commands = commands;
    this.layout = new PanelLayout();
    this.addClass(CELL_MENU_CLASS);
    this._addButtons(items);
  }

  handleEvent(event: Event): void {
    switch (event.type) {
      case 'mousedown':
      case 'click':
        // Ensure the mouse event is not propagated on the cell.
        event.stopPropagation();
        break;
    }
  }

  /**
   * Handle `after-attach` messages for the widget.
   */
  onAfterAttach(): void {
    this.node.addEventListener('mousedown', this);
    this.node.addEventListener('click', this);
  }

  /**
   * Handle `before-detach` messages for the widget.
   */
  onBeforeDetach(): void {
    this.node.removeEventListener('mousedown', this);
    this.node.removeEventListener('click', this);
  }

  protected _addButtons(items: ICellMenuItem[]): void {
    each(this.children(), widget => {
      widget.dispose();
    });

    const layout = this.layout as PanelLayout;
    items.forEach(entry => {
      if (this._commands.hasCommand(entry.command)) {
        layout.addWidget(
          new ToolbarButton({
            icon: LabIcon.resolve({ icon: entry.icon }),
            className: `jp-cell-${entry.cellType ?? 'all'}`,
            onClickWithEvent: (e: Event): void => {
              // Prevent propagation of this event in case the command causes the
              // current cell to move. If the cell moves and the event propagates to the
              // new cell, this may have an effect on the new cell.
              this._commands.execute(entry.command);
              e.stopPropagation();
            },
            tooltip: entry.tooltip ?? this._commands.label(entry.command)
          })
        );
      }
    });
  }

  private _commands: CommandRegistry;
}
