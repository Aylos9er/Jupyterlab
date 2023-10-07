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
  IInlineCompleterSettings,
  InlineCompleter,
  KernelCompleterProvider
} from '@jupyterlab/completer';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  caretLeftIcon,
  caretRightIcon,
  checkIcon,
  IFormRenderer,
  IFormRendererRegistry
} from '@jupyterlab/ui-components';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import type { FieldProps } from '@rjsf/utils';
import { CommandRegistry } from '@lumino/commands';

import { renderAvailableProviders } from './renderer';

const COMPLETION_MANAGER_PLUGIN = '@jupyterlab/completer-extension:manager';
const INLINE_COMPLETER_PLUGIN =
  '@jupyterlab/completer-extension:inline-completer';

namespace CommandIDs {
  export const nextInline = 'inline-completer:next';
  export const previousInline = 'inline-completer:previous';
  export const acceptInline = 'inline-completer:accept';
  export const invokeInline = 'inline-completer:invoke';
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

const inlineCompleterFactory: JupyterFrontEndPlugin<IInlineCompleterFactory> = {
  id: '@jupyterlab/completer-extension:inline-completer-factory',
  description: 'Provides a factory for inline completer.',
  provides: IInlineCompleterFactory,
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator | null
  ): IInlineCompleterFactory => {
    const trans = (translator || nullTranslator).load('jupyterlab');
    return {
      factory: options => {
        const inlineCompleter = new InlineCompleter({
          ...options,
          trans: trans
        });
        const describeShortcut = (commandID: string): string => {
          const binding = app.commands.keyBindings.find(
            binding => binding.command === commandID
          );
          const keys = binding
            ? CommandRegistry.formatKeystroke(binding.keys)
            : '';
          return keys ? `${keys}` : '';
        };
        inlineCompleter.toolbar.addItem(
          'previous-inline-completion',
          new CommandToolbarButton({
            commands: app.commands,
            icon: caretLeftIcon,
            id: CommandIDs.previousInline,
            label: describeShortcut(CommandIDs.previousInline),
            caption: trans.__('Previous')
          })
        );
        inlineCompleter.toolbar.addItem(
          'next-inline-completion',
          new CommandToolbarButton({
            commands: app.commands,
            icon: caretRightIcon,
            id: CommandIDs.nextInline,
            label: describeShortcut(CommandIDs.nextInline),
            caption: trans.__('Next')
          })
        );
        inlineCompleter.toolbar.addItem(
          'accept-inline-completion',
          new CommandToolbarButton({
            commands: app.commands,
            icon: checkIcon,
            id: CommandIDs.acceptInline,
            label: describeShortcut(CommandIDs.acceptInline),
            caption: trans.__('Accept')
          })
        );
        return inlineCompleter;
      }
    };
  }
};

const inlineCompleter: JupyterFrontEndPlugin<void> = {
  id: INLINE_COMPLETER_PLUGIN,
  description: 'Provides a factory for inline completer.',
  requires: [
    ICompletionProviderManager,
    IInlineCompleterFactory,
    ISettingRegistry
  ],
  optional: [ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    completionManager: ICompletionProviderManager,
    factory: IInlineCompleterFactory,
    settings: ISettingRegistry,
    translator: ITranslator | null
  ): void => {
    completionManager.setInlineCompleterFactory(factory);
    const trans = (translator || nullTranslator).load('jupyterlab');
    const isEnabled = () =>
      !!app.shell.currentWidget && !!completionManager.inline;
    app.commands.addCommand(CommandIDs.nextInline, {
      execute: () => {
        completionManager.inline?.cycle(app.shell.currentWidget!.id!, 'next');
      },
      label: trans.__('Next Inline Completion'),
      isEnabled
    });
    app.commands.addCommand(CommandIDs.previousInline, {
      execute: () => {
        completionManager.inline?.cycle(
          app.shell.currentWidget!.id!,
          'previous'
        );
      },
      label: trans.__('Previous Inline Completion'),
      isEnabled
    });
    app.commands.addCommand(CommandIDs.acceptInline, {
      execute: () => {
        completionManager.inline?.accept(app.shell.currentWidget!.id!);
      },
      label: trans.__('Accept Inline Completion'),
      isEnabled
    });
    app.commands.addCommand(CommandIDs.invokeInline, {
      execute: () => {
        completionManager.inline?.accept(app.shell.currentWidget!.id!);
      },
      label: trans.__('Invoke Inline Completer'),
      isEnabled
    });

    const updateSettings = (settings: ISettingRegistry.ISettings) => {
      completionManager.inline?.configure(
        settings.composite as unknown as IInlineCompleterSettings
      );
    };

    app.restored
      .then(() => {
        const availableProviders = completionManager.inlineProviders ?? [];
        settings.transform(INLINE_COMPLETER_PLUGIN, {
          fetch: plugin => {
            const schema = plugin.schema.properties!;
            const providers: {
              [property: string]: ISettingRegistry.IProperty;
            } = {};
            for (const provider of availableProviders) {
              providers[provider.identifier] = {
                title: trans.__('%1 provider', provider.name),
                properties: {
                  ...(provider.schema?.properties ?? {}),
                  timeout: {
                    title: trans.__('Timeout'),
                    description: trans.__(
                      'Timeout for %1 provider (in milliseconds).',
                      provider.name
                    ),
                    type: 'number',
                    minimum: 0
                  },
                  debouncerDelay: {
                    title: trans.__('Debouncer delay'),
                    minimum: 0,
                    description: trans.__(
                      'Time since the last key press to wait before requesting completions from %1 provider (in milliseconds).',
                      provider.name
                    ),
                    type: 'number'
                  },
                  enabled: {
                    title: trans.__('Enabled'),
                    description: trans.__(
                      'Whether to fetch completions %1 provider.',
                      provider.name
                    ),
                    type: 'boolean'
                  }
                },
                default: {
                  // By default all providers are opt-out, but
                  // any provider can configure itself to be opt-in.
                  enabled: true,
                  timeout: 5000,
                  debouncerDelay: 0,
                  ...((provider.schema?.default as object) ?? {})
                },
                type: 'object'
              };
            }
            schema['providers']['properties'] = providers;
            return plugin;
          }
        });

        const settingsPromise = settings.load(INLINE_COMPLETER_PLUGIN);
        settingsPromise
          .then(settingValues => {
            updateSettings(settingValues);
            settingValues.changed.connect(newSettings => {
              updateSettings(newSettings);
            });
          })
          .catch(console.error);
      })
      .catch(console.error);
  }
};

const manager: JupyterFrontEndPlugin<ICompletionProviderManager> = {
  id: COMPLETION_MANAGER_PLUGIN,
  description: 'Provides the completion provider manager.',
  requires: [ISettingRegistry],
  optional: [IFormRendererRegistry],
  provides: ICompletionProviderManager,
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    settings: ISettingRegistry,
    editorRegistry: IFormRendererRegistry | null
  ): ICompletionProviderManager => {
    const AVAILABLE_PROVIDERS = 'availableProviders';
    const PROVIDER_TIMEOUT = 'providerTimeout';
    const SHOW_DOCUMENT_PANEL = 'showDocumentationPanel';
    const CONTINUOUS_HINTING = 'autoCompletion';
    const manager = new CompletionProviderManager();
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
  inlineCompleterFactory,
  inlineCompleter
];
export default plugins;
