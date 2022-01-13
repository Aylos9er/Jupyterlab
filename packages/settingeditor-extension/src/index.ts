/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/
/**
 * @packageDocumentation
 * @module settingeditor-extension
 */

import {
  ILabStatus,
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { ICommandPalette, WidgetTracker } from '@jupyterlab/apputils';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { IFormComponentRegistry } from '@jupyterlab/ui-components';
import { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import {
  IJSONSettingEditorTracker,
  ISettingEditorTracker,
  JsonSettingEditor,
  SettingsEditor
} from '@jupyterlab/settingeditor';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { IStateDB } from '@jupyterlab/statedb';
import { ITranslator } from '@jupyterlab/translation';
import { saveIcon, settingsIcon, undoIcon } from '@jupyterlab/ui-components';
import { IDisposable } from '@lumino/disposable';

/**
 * The command IDs used by the setting editor.
 */
namespace CommandIDs {
  export const open = 'settingeditor:open';

  export const openJSON = 'settingeditor:open-json';

  export const revert = 'settingeditor:revert';

  export const save = 'settingeditor:save';
}

/**
 * The default setting editor extension.
 */
const plugin: JupyterFrontEndPlugin<ISettingEditorTracker> = {
  id: '@jupyterlab/settingeditor-extension:form-ui',
  requires: [
    ISettingRegistry,
    IStateDB,
    ITranslator,
    IFormComponentRegistry,
    ILabStatus
  ],
  optional: [ILayoutRestorer, ICommandPalette],
  autoStart: true,
  provides: ISettingEditorTracker,
  activate
};

/**
 * Activate the setting editor extension.
 */
function activate(
  app: JupyterFrontEnd,
  registry: ISettingRegistry,
  state: IStateDB,
  translator: ITranslator,
  editorRegistry: IFormComponentRegistry,
  status: ILabStatus,
  restorer?: ILayoutRestorer,
  palette?: ICommandPalette
): ISettingEditorTracker {
  const trans = translator.load('jupyterlab');
  const { commands, shell } = app;
  const namespace = 'setting-editor';
  const tracker = new WidgetTracker<SettingsEditor>({
    namespace
  });

  // Handle state restoration.
  if (restorer) {
    void restorer.restore(tracker, {
      command: CommandIDs.open,
      args: widget => ({}),
      name: widget => namespace
    });
  }

  if (palette) {
    palette.addItem({
      category: trans.__('Settings'),
      command: CommandIDs.open
    });
  }

  commands.addCommand(CommandIDs.open, {
    execute: () => {
      if (tracker.currentWidget) {
        shell.activateById(tracker.currentWidget.id);
        return;
      }

      const key = plugin.id;

      const editor = new SettingsEditor({
        editorRegistry,
        key,
        registry,
        state,
        commands,
        translator,
        status
      });

      editor.id = namespace;
      editor.title.icon = settingsIcon;
      editor.title.label = trans.__('Settings');
      editor.title.closable = true;

      void tracker.add(editor);
      shell.add(editor);
    },
    label: trans.__('Settings Editor')
  });

  return tracker;
}

/**
 * The default setting editor extension.
 */
const jsonPlugin: JupyterFrontEndPlugin<IJSONSettingEditorTracker> = {
  id: '@jupyterlab/settingeditor-extension:plugin',
  requires: [
    ISettingRegistry,
    IEditorServices,
    IStateDB,
    IRenderMimeRegistry,
    ILabStatus,
    ITranslator
  ],
  optional: [ILayoutRestorer, ICommandPalette],
  autoStart: true,
  provides: IJSONSettingEditorTracker,
  activate: activateJSON
};

/**
 * Activate the setting editor extension.
 */
function activateJSON(
  app: JupyterFrontEnd,
  registry: ISettingRegistry,
  editorServices: IEditorServices,
  state: IStateDB,
  rendermime: IRenderMimeRegistry,
  status: ILabStatus,
  translator: ITranslator,
  restorer: ILayoutRestorer | null,
  palette: ICommandPalette | null
): IJSONSettingEditorTracker {
  const trans = translator.load('jupyterlab');
  const { commands, shell } = app;
  const namespace = 'json-setting-editor';
  const factoryService = editorServices.factoryService;
  const editorFactory = factoryService.newInlineEditor;
  const tracker = new WidgetTracker<JsonSettingEditor>({
    namespace
  });
  let editor: JsonSettingEditor;

  // Handle state restoration.
  if (restorer) {
    void restorer.restore(tracker, {
      command: CommandIDs.openJSON,
      args: widget => ({}),
      name: widget => namespace
    });
  }

  commands.addCommand(CommandIDs.openJSON, {
    execute: () => {
      if (tracker.currentWidget) {
        shell.activateById(tracker.currentWidget.id);
        return;
      }

      const key = plugin.id;
      const when = app.restored;

      editor = new JsonSettingEditor({
        commands: {
          registry: commands,
          revert: CommandIDs.revert,
          save: CommandIDs.save
        },
        editorFactory,
        key,
        registry,
        rendermime,
        state,
        translator,
        when
      });

      let disposable: IDisposable | null = null;
      // Notify the command registry when the visibility status of the setting
      // editor's commands change. The setting editor toolbar listens for this
      // signal from the command registry.
      editor.commandsChanged.connect((sender: any, args: string[]) => {
        args.forEach(id => {
          commands.notifyCommandChanged(id);
        });
        if (editor.canSaveRaw) {
          if (!disposable) {
            disposable = status.setDirty();
          }
        } else if (disposable) {
          disposable.dispose();
          disposable = null;
        }
        editor.disposed.connect(() => {
          if (disposable) {
            disposable.dispose();
          }
        });
      });

      editor.id = namespace;
      editor.title.icon = settingsIcon;
      editor.title.label = trans.__('Advanced Settings Editor');
      editor.title.closable = true;

      void tracker.add(editor);
      shell.add(editor);
    },
    label: trans.__('Advanced Settings Editor')
  });
  if (palette) {
    palette.addItem({
      category: trans.__('Advanced Settings Editor'),
      command: CommandIDs.openJSON
    });
  }

  commands.addCommand(CommandIDs.revert, {
    execute: () => {
      tracker.currentWidget?.revert();
    },
    icon: undoIcon,
    label: trans.__('Revert User Settings'),
    isEnabled: () => tracker.currentWidget?.canRevertRaw ?? false
  });

  commands.addCommand(CommandIDs.save, {
    execute: () => tracker.currentWidget?.save(),
    icon: saveIcon,
    label: trans.__('Save User Settings'),
    isEnabled: () => tracker.currentWidget?.canSaveRaw ?? false
  });

  return tracker;
}

export default [plugin, jsonPlugin];
