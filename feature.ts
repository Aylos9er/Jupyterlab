import { CodeEditor } from '@jupyterlab/codeeditor';
import { CommandEntryPoint, ICommandContext } from './command_manager';
import { IEditorChange, IVirtualEditor } from './virtual/editor';
import { VirtualDocument } from './virtual/document';
import { LSPConnection } from './connection';
import { IRootPosition } from './positioning';
import { StatusMessage } from './adapters/jupyterlab/jl_adapter';
import IEditor = CodeEditor.IEditor;
import { ISettingRegistry } from '@jupyterlab/settingregistry';

export interface IFeatureCommand {
  /**
   * The command id; it will be prepended with 'lsp' prefix.
   * To support multiple attachment points, multiple actual commands will be created,
   * identified by an attachment-point-specific suffix.
   */
  id: string;
  execute: (context: ICommandContext) => void;
  is_enabled: (context: ICommandContext) => boolean;
  label: string;
  /**
   * Default infinity (unassigned) if absolute, otherwise 0 (for relative ranks)
   */
  rank?: number;
  /**
   * Does the rank represent relative position in the LSP commands group? (default: true)
   */
  is_rank_relative?: boolean;
  /**
   * By default the command will be attached to context menus of each adapter.
   */
  attach_to?: Set<CommandEntryPoint>;
}

export class FeatureSettings<T> {
  protected settings: ISettingRegistry.ISettings;

  constructor(protected settingRegistry: ISettingRegistry, featureID: string) {
    if (!(featureID in settingRegistry.plugins)) {
      console.warn(
        `${featureID} settings schema could not be found and was not loaded`
      );
    } else {
      settingRegistry
        .load(featureID)
        .then(settings => {
          this.settings = settings;
          settings.changed.connect(() => {
            this.settings = settings;
          });
        })
        .catch(console.warn);
    }
  }

  get composite(): T {
    return (this.settings.composite as unknown) as T;
  }

  set(setting: string, value: any) {
    this.settings.set(setting, value).catch(console.warn);
  }
}

/**
 * Names of the supported editors.
 *
 * Note: once the dynamic editor adapters support is implemented,
 * this type will be replaced by string and the dynamic checks will be implemented instead.
 */
export type IEditorName = 'CodeMirrorEditor';

export interface IFeature {
  /**
   * The feature identifier. It must be the same as the feature plugin id.
   */
  id: string;
  /**
   * The user-readable name of the feature.
   */
  name: string;
  /**
   * Each feature can be written in mind with support for one or more editors.
   * Separate editor integration implementations should be provided for each supported editor.
   *
   * Currently only CodeMirrorEditor is supported.
   */
  editorIntegrationFactory: Map<
    IEditorName,
    IFeatureEditorIntegrationConstructor<IVirtualEditor<IEditor>>
  >;
  /**
   * Command specification, including context menu placement options.
   */
  commands?: Array<IFeatureCommand>;
  /**
   * Objects implementing JupyterLab-specific integration,
   * for example, adding new GUI elements such as hover tooltips or replacing completer.
   *
   * It can be accessed from the FeatureEditorIntegration object
   * constructor using (options: IEditorIntegrationOptions).feature.
   */
  labIntegration?: IFeatureLabIntegration;
  /**
   * Settings to be passed to the FeatureEditorIntegration.
   * To use the same settings for lab integration bind the same FeatureSettings object to the labIntegration object.
   */
  settings?: FeatureSettings<any>;
}

export abstract class FeatureEditorIntegration<
  T extends IVirtualEditor<IEditor>
> {
  is_registered: boolean;
  feature: IFeature;

  protected virtual_editor: IVirtualEditor<T>;
  protected virtual_document: VirtualDocument;
  protected connection: LSPConnection;
  protected status_message: StatusMessage;

  get settings() {
    return this.feature.settings;
  }

  get lab_integration() {
    return this.feature.labIntegration;
  }

  protected constructor(options: IEditorIntegrationOptions) {
    this.feature = options.feature;
    this.virtual_editor = options.virtual_editor;
    this.virtual_document = options.virtual_document;
    this.connection = options.connection;
    this.status_message = options.status_message;
  }

  /**
   * Connect event handlers to the editor, virtual document and connection(s)
   */
  abstract register(): void;

  /**
   * Will allow the user to disable specific functions
   */
  abstract isEnabled(): boolean;

  /**
   * Remove event handlers on destruction
   */
  abstract remove(): void;

  // TODO: replace with a signal
  abstract afterChange(
    change: IEditorChange,
    root_position: IRootPosition
  ): void;
}

export interface IFeatureEditorIntegrationConstructor<
  T extends IVirtualEditor<IEditor>
> {
  new (options: IEditorIntegrationOptions): FeatureEditorIntegration<T>;
}

export interface IEditorIntegrationOptions {
  feature: IFeature;
  virtual_editor: IVirtualEditor<IEditor>;
  virtual_document: VirtualDocument;
  connection: LSPConnection;
  status_message: StatusMessage;
  settings: FeatureSettings<any>;
}

export interface IFeatureLabIntegration {
  settings?: FeatureSettings<any>;
}
