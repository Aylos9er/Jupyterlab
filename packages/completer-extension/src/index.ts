// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module completer-extension
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { CommandToolbarButton } from '@jupyterlab/ui-components';
import {
  CompletionProviderManager,
  ContextCompleterProvider,
  HistoryInlineCompletionProvider,
  ICompletionProviderManager,
  IInlineCompleterFactory,
  InlineCompleter,
  KernelCompleterProvider
} from '@jupyterlab/completer';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  IFormRenderer,
  IFormRendererRegistry
} from '@jupyterlab/ui-components';
import type { FieldProps } from '@rjsf/utils';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';

import { renderAvailableProviders } from './renderer';

const COMPLETION_MANAGER_PLUGIN = '@jupyterlab/completer-extension:manager';

namespace CommandIDs {
  export const nextInline = 'inline-completer:next';
  export const previousInline = 'inline-completer:previous';
}

const defaultProviders: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/completer-extension:base-service',
  description: 'Adds context and kernel completion providers.',
  requires: [ICompletionProviderManager],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    completionManager: ICompletionProviderManager
  ): void => {
    completionManager.registerProvider(new ContextCompleterProvider());
    completionManager.registerProvider(new KernelCompleterProvider());
  }
};

const inlineHistoryProvider: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/completer-extension:inline-history',
  description:
    'Adds inline completion provider suggesting code from execution history.',
  requires: [ICompletionProviderManager],
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    completionManager: ICompletionProviderManager,
    translator: ITranslator | null
  ): void => {
    completionManager.registerInlineProvider(
      new HistoryInlineCompletionProvider({
        translator: translator ?? nullTranslator
      })
    );
  }
};

const inlineCompleter: JupyterFrontEndPlugin<IInlineCompleterFactory> = {
  id: '@jupyterlab/completer-extension:inline-completer',
  description: 'Provides a factory for inline completer.',
  provides: IInlineCompleterFactory,
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator | null
  ): IInlineCompleterFactory => {
    //const trans = (translator || nullTranslator).load('jupyterlab');
    return {
      factory: options => {
        const inlineCompleter = new InlineCompleter(options);
        inlineCompleter.toolbar.addItem(
          'previous',
          new CommandToolbarButton({
            commands: app.commands,
            id: CommandIDs.previousInline
            //icon: ,
            //label: trans.__('Previous (shortcut)')
          })
        );
        inlineCompleter.toolbar.addItem(
          'next',
          new CommandToolbarButton({
            commands: app.commands,
            id: CommandIDs.nextInline
          })
        );
        return inlineCompleter;
      }
    };
  }
};

const inlineCompleterCommands: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/completer-extension:inline-completer-commands',
  description: 'Register inline completer commands.',
  requires: [ICompletionProviderManager],
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    completionManager: ICompletionProviderManager,
    translator: ITranslator | null
  ): void => {
    const trans = (translator || nullTranslator).load('jupyterlab');
    app.commands.addCommand(CommandIDs.nextInline, {
      execute: () => {
        completionManager.cycleInline(app.shell.currentWidget!.id!, 'next');
      },
      label: () => trans.__('Next'),
      isEnabled: () => !!app.shell.currentWidget
    });
    app.commands.addCommand(CommandIDs.previousInline, {
      execute: () => {
        completionManager.cycleInline(app.shell.currentWidget!.id!, 'previous');
      },
      label: () => trans.__('Previous'),
      isEnabled: () => !!app.shell.currentWidget
    });
  }
};

const manager: JupyterFrontEndPlugin<ICompletionProviderManager> = {
  id: COMPLETION_MANAGER_PLUGIN,
  description: 'Provides the completion provider manager.',
  requires: [ISettingRegistry],
  optional: [IFormRendererRegistry, IInlineCompleterFactory],
  provides: ICompletionProviderManager,
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    settings: ISettingRegistry,
    editorRegistry: IFormRendererRegistry | null,
    inlineCompleterFactory: IInlineCompleterFactory | null
  ): ICompletionProviderManager => {
    const AVAILABLE_PROVIDERS = 'availableProviders';
    const PROVIDER_TIMEOUT = 'providerTimeout';
    const SHOW_DOCUMENT_PANEL = 'showDocumentationPanel';
    const CONTINUOUS_HINTING = 'autoCompletion';
    const manager = new CompletionProviderManager({
      inlineCompleterFactory
    });
    const updateSetting = (
      settingValues: ISettingRegistry.ISettings,
      availableProviders: string[]
    ): void => {
      const providersData = settingValues.get(AVAILABLE_PROVIDERS);
      const timeout = settingValues.get(PROVIDER_TIMEOUT);
      const showDoc = settingValues.get(SHOW_DOCUMENT_PANEL);
      const continuousHinting = settingValues.get(CONTINUOUS_HINTING);
      manager.setTimeout(timeout.composite as number);
      manager.setShowDocumentationPanel(showDoc.composite as boolean);
      manager.setContinuousHinting(continuousHinting.composite as boolean);
      const selectedProviders = providersData.user ?? providersData.composite;
      const sortedProviders = Object.entries(selectedProviders ?? {})
        .filter(val => val[1] >= 0 && availableProviders.includes(val[0]))
        .sort(([, rank1], [, rank2]) => rank2 - rank1)
        .map(item => item[0]);
      manager.activateProvider(sortedProviders);
    };

    app.restored
      .then(() => {
        const availableProviders = [...manager.getProviders().entries()];
        const availableProviderIDs = availableProviders.map(
          ([key, value]) => key
        );
        settings.transform(COMPLETION_MANAGER_PLUGIN, {
          fetch: plugin => {
            const schema = plugin.schema.properties!;
            const defaultValue: { [key: string]: number } = {};
            availableProviders.forEach(([key, value], index) => {
              defaultValue[key] = value.rank ?? (index + 1) * 10;
            });
            schema[AVAILABLE_PROVIDERS]['default'] = defaultValue;
            return plugin;
          }
        });
        const settingsPromise = settings.load(COMPLETION_MANAGER_PLUGIN);
        settingsPromise
          .then(settingValues => {
            updateSetting(settingValues, availableProviderIDs);
            settingValues.changed.connect(newSettings => {
              updateSetting(newSettings, availableProviderIDs);
            });
          })
          .catch(console.error);
      })
      .catch(console.error);

    if (editorRegistry) {
      const renderer: IFormRenderer = {
        fieldRenderer: (props: FieldProps) => {
          return renderAvailableProviders(props);
        }
      };
      editorRegistry.addRenderer(
        `${COMPLETION_MANAGER_PLUGIN}.availableProviders`,
        renderer
      );
    }

    return manager;
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  manager,
  defaultProviders,
  inlineHistoryProvider,
  inlineCompleterCommands,
  inlineCompleter
];
export default plugins;
