/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module pluginmanager-extension
 */
import {
  ILayoutRestorer,
  JupyterFrontEndPlugin,
  JupyterLab
} from '@jupyterlab/application';
import {
  ICommandPalette,
  MainAreaWidget,
  WidgetTracker
} from '@jupyterlab/apputils';
import { IMainMenu } from '@jupyterlab/mainmenu';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import {
  CommandToolbarButton,
  extensionIcon,
  refreshIcon
} from '@jupyterlab/ui-components';
import { ReadonlyJSONObject } from '@lumino/coreutils';
import { PluginListModel, Plugins } from '@jupyterlab/pluginmanager';

/**
 * The command IDs used by the pluginmanager plugin.
 */
namespace CommandIDs {
  export const open = 'pluginmanager:open';

  export const refreshPlugins = 'pluginmanager:refresh';
}

const PLUGIN_ID = '@jupyterlab/pluginmanager-extension:plugin';

/**
 * A plugin for managing status of other plugins.
 */
const pluginmanager: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Enable or disable individual plugins.',
  autoStart: true,
  requires: [],
  optional: [ITranslator, IMainMenu, ICommandPalette, ILayoutRestorer],
  activate: (
    app: JupyterLab,
    translator: ITranslator | null,
    menu: IMainMenu | null,
    palette: ICommandPalette | null,
    restorer: ILayoutRestorer | null
  ) => {
    const { commands, shell } = app;
    translator = translator ?? nullTranslator;
    const trans = translator.load('jupyterlab');

    // Translation strings.
    const category = trans.__('Plugin Manager');
    const widgetLabel = trans.__('Advanced Plugin Manager');
    const refreshPlugins = trans.__('Refresh Plugin List');

    const namespace = 'plugin-manager';
    const tracker = new WidgetTracker<MainAreaWidget<Plugins>>({
      namespace: namespace
    });

    /**
     * Create a MainAreaWidget for Plugin Manager.
     */
    function createWidget(args?: PluginListModel.IConfigurableState) {
      const model = new PluginListModel({
        ...args,
        pluginData: {
          availablePlugins: app.info.availablePlugins
        },
        serverSettings: app.serviceManager.serverSettings,
        extraLockedPlugins: [
          PLUGIN_ID,
          // UI will not proceed beyond splash without `layout` plugin
          '@jupyterlab/application-extension:layout',
          // State restoration does not work well without resolver,
          // can leave user locked out of the plugin manager
          // (if command palette and menu are disabled too)
          '@jupyterlab/apputils-extension:resolver'
        ],
        translator: translator ?? nullTranslator
      });
      const content = new Plugins({
        model,
        translator: translator ?? nullTranslator
      });
      content.title.label = widgetLabel;
      content.title.icon = extensionIcon;
      const main = new MainAreaWidget({ content, reveal: model.ready });

      main.toolbar.addItem(
        'refresh-plugins',
        new CommandToolbarButton({
          id: CommandIDs.refreshPlugins,
          args: { noLabel: true },
          commands
        })
      );

      return main;
    }

    // Register commands.
    commands.addCommand(CommandIDs.open, {
      label: widgetLabel,
      execute: () => {
        const main = createWidget();
        shell.add(main, 'main', { type: 'Plugins' });

        // add to tracker so it can be restored, and update when choices change
        void tracker.add(main);
        main.content.model.trackerDataChanged.connect(() => {
          void tracker.save(main);
        });
        return main;
      }
    });

    commands.addCommand(CommandIDs.refreshPlugins, {
      label: args => (args.noLabel ? '' : refreshPlugins),
      caption: trans.__('Refresh plugins list'),
      icon: refreshIcon,
      execute: async () => {
        return tracker.currentWidget?.content.model
          .refresh()
          .catch((reason: Error) => {
            console.error(
              `Failed to refresh the available plugins list:\n${reason}`
            );
          });
      }
    });

    if (palette) {
      palette.addItem({ command: CommandIDs.open, category });
    }

    if (menu) {
      const settingsMenu = menu.settingsMenu;
      settingsMenu.addItem({ command: CommandIDs.open });
    }

    if (restorer) {
      void restorer.restore(tracker, {
        command: CommandIDs.open,
        name: _ => 'plugins',
        args: widget => {
          const { query } = widget.content.model;
          const args: PluginListModel.IConfigurableState = {
            query
          };
          return args as ReadonlyJSONObject;
        }
      });
    }
  }
};

const plugins: JupyterFrontEndPlugin<any>[] = [pluginmanager];

export default plugins;
