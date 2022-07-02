// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module metadataform-extension
 */

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  INotebookTools,
  INotebookTracker,
  NotebookTools
} from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';
import {
  JSONExt,
  PartialJSONArray,
  PartialJSONObject,
  PartialJSONValue,
  ReadonlyPartialJSONObject,
  ReadonlyPartialJSONValue
} from '@lumino/coreutils';
import { Message } from '@lumino/messaging';
import { ReactWidget } from '@jupyterlab/ui-components';
import { SingletonLayout, Widget } from '@lumino/widgets';
import Form, { IChangeEvent } from '@rjsf/core';
import { JSONSchema7 } from 'json-schema';
import React from 'react';
import { IMetadataForm, IMetadataFormProvider } from './token';

export { IMetadataForm, IMetadataFormProvider };

const PLUGIN_ID = '@jupyterlab/metadataform-extension:metadataforms';

/**
 * A class that create a metadata form widget
 */
export class MetadataFormWidget extends NotebookTools.Tool {
  /**
   * Construct an empty widget.
   */
  constructor(
    builtProperties: Private.IProperties,
    pluginId?: string,
    translator?: ITranslator
  ) {
    super();
    this.builtProperties = builtProperties;
    this._pluginId = pluginId;
    this.translator = translator || nullTranslator;
    this._trans = this.translator.load('jupyterlab');
    this._updatingMetadata = false;
    const layout = (this.layout = new SingletonLayout());

    const node = document.createElement('div');
    const content = document.createElement('div');
    content.textContent = this._trans.__('No metadata.');
    content.className = 'jp-MetadataForm-placeholderContent';
    node.appendChild(content);
    this._placeholder = new Widget({ node });
    this._placeholder.addClass('jp-MetadataForm-placeholder');
    layout.widget = this._placeholder;
  }

  /**
   * Set the content of the widget.
   */
  protected setContent(content: Widget | null): void {
    const layout = this.layout as SingletonLayout;
    if (layout.widget) {
      layout.widget.removeClass('jp-MetadataForm-content');
      layout.removeWidget(layout.widget);
    }
    if (!content) {
      content = this._placeholder;
    }
    content.addClass('jp-MetadataForm-content');
    layout.widget = content;
  }

  /**
   * Build widget
   */
  buildWidget(formData?: ReadonlyPartialJSONObject): void {
    const form = (
      <Form
        schema={this.builtProperties as JSONSchema7}
        formData={formData}
        idPrefix={`jp-MetadataForm-${this._pluginId}`}
        onChange={(e: IChangeEvent<ReadonlyPartialJSONObject>) => {
          this.updateMetadata(this.builtProperties.metadataKeys, e.formData);
        }}
      />
    );
    const widget = ReactWidget.create(form);
    Widget.attach(widget, document.body);
    widget.addClass('jp-MetadataForm');
    this.setContent(widget);
  }

  /**
   * Handle a change to the active cell.
   */
  protected onActiveCellChanged(msg: Message): void {
    this._update();
  }

  /**
   * Handle a change to the active cell metadata.
   */
  protected onActiveCellMetadataChanged(msg: Message): void {
    if (!this._updatingMetadata) this._update();
  }

  /**
   * Update the form with current cell metadata.
   */
  private _update(): void {
    const formData = {} as PartialJSONObject;

    const cell = this.notebookTools.activeCell;

    if (cell == undefined) return;

    for (let [key, nestedKeys] of Object.entries(
      this.builtProperties.metadataKeys
    )) {
      let workingObject: PartialJSONObject = cell.model.metadata.toJSON();
      let hasValue = true;
      // Navigate to the value
      for (let nested of nestedKeys.slice(0, -1)) {
        if (nested in workingObject)
          workingObject = workingObject[nested] as PartialJSONObject;
        else {
          hasValue = false;
          break;
        }
      }

      // Fill the formData with the current metadata value
      if (hasValue)
        formData[key] = workingObject[nestedKeys[nestedKeys.length - 1]];
    }

    this.buildWidget(formData);
  }

  /**
   * Update the metadata of the current cell.
   * @param formData: the cell metadata set in the form.
   */
  public updateMetadata(
    metadataKeys: Private.IProperties['metadataKeys'],
    formData: ReadonlyPartialJSONObject
  ) {
    if (this.notebookTools == undefined) {
      console.log('NO notebook tool');
      return;
    }
    const cell = this.notebookTools.activeCell;
    if (cell == undefined) {
      console.log('NO CELL');
      return;
    }
    this._updatingMetadata = true;

    // Build the list of metadata to modify
    const metadataList: {
      [metadata: string]: PartialJSONObject | PartialJSONValue;
    } = {};
    for (let [key, value] of Object.entries(formData)) {
      let baseMetadata = metadataKeys[key][0];
      if (baseMetadata == undefined) continue;

      if (metadataKeys[key].length == 1) {
        metadataList[baseMetadata] = value as PartialJSONValue;
        continue;
      }

      let intermediateKeys = metadataKeys[key].slice(1, -1);

      if (!(baseMetadata in metadataList)) {
        metadataList[baseMetadata] = cell.model.metadata.toJSON()[
          baseMetadata
        ] as PartialJSONObject;
      }

      let workingObject: PartialJSONObject = metadataList[
        baseMetadata
      ] as PartialJSONObject;
      for (let nested of intermediateKeys) {
        if (!(nested in workingObject)) workingObject[nested] = {};
        workingObject = workingObject[nested] as PartialJSONObject;
      }

      workingObject[metadataKeys[key][metadataKeys[key].length - 1]] =
        value as PartialJSONValue;
    }

    // Set the metadata or delete it if value is undefined
    for (let [key, value] of Object.entries(metadataList)) {
      if (value === undefined) cell.model.metadata.delete(key);
      else cell.model.metadata.set(key, value as ReadonlyPartialJSONValue);
    }
    this._updatingMetadata = false;
  }

  public tracker: INotebookTracker;
  protected translator: ITranslator;
  private _trans: TranslationBundle;
  private builtProperties: Private.IProperties;
  private _placeholder: Widget;
  private _updatingMetadata: boolean;
  private _pluginId: PartialJSONValue | undefined;
}

namespace Private {
  export interface IProperties {
    metadataKeys: { [metadataKey: string]: Array<string> };
    properties: { [metadataKey: string]: PartialJSONObject };
  }

  export async function loadSettingsMetadataForm(
    app: JupyterFrontEnd,
    tools: MetadataFormWidget[],
    registry: ISettingRegistry,
    notebookTools: INotebookTools,
    translator: ITranslator
  ): Promise<void> {
    let canonical: ISettingRegistry.ISchema | null;
    let loaded: { [name: string]: ISettingRegistry.IMetadataForm[] } = {};

    /**
     * Populate the plugin's schema defaults.
     */
    function populate(schema: ISettingRegistry.ISchema) {
      loaded = {};
      schema.properties!.metadataforms.default = Object.keys(registry.plugins)
        .map(plugin => {
          const metadataforms =
            registry.plugins[plugin]!.schema['jupyter.lab.metadataforms'] ?? [];

          metadataforms.forEach(metadataform => {
            metadataform._origin = plugin;
          });
          loaded[plugin] = metadataforms;
          return metadataforms;
        })
        .concat([schema['jupyter.lab.metadataforms'] as any[]])
        .reduce((acc, val) => {
          return acc.concat(val);
        }, []); // flatten one level;
    }

    // Transform the plugin object to return different schema than the default.
    registry.transform(PLUGIN_ID, {
      compose: plugin => {
        // Only override the canonical schema the first time.
        if (!canonical) {
          canonical = JSONExt.deepCopy(plugin.schema);
          populate(canonical);
        }

        const defaults =
          (canonical.properties?.metadataforms?.default as PartialJSONArray) ??
          [];

        const user = {
          metadataforms: plugin.data.user.metadataforms ?? []
        };
        const composite = {
          metadataforms: defaults.concat(user.metadataforms)
        };

        plugin.data = { composite, user };
        return plugin;
      },
      fetch: plugin => {
        // Only override the canonical schema the first time.
        if (!canonical) {
          canonical = JSONExt.deepCopy(plugin.schema);
          populate(canonical);
        }

        return {
          data: plugin.data,
          id: plugin.id,
          raw: plugin.raw,
          schema: canonical,
          version: plugin.version
        };
      }
    });

    // Repopulate the canonical variable after the setting registry has
    // preloaded all initial plugins.
    canonical = null;

    const settings = await registry.load(PLUGIN_ID);

    console.log(settings);

    // Create menu for non-disabled element
    for (let schema of settings.composite
      .metadataforms as ISettingRegistry.IMetadataForm[]) {
      let builtProperties: IProperties = { metadataKeys: {}, properties: {} };
      for (let metadataKey of schema.metadataKeys) {
        builtProperties.metadataKeys[metadataKey.metadataKey.join('.')] =
          metadataKey.metadataKey;
        builtProperties.properties[metadataKey.metadataKey.join('.')] =
          metadataKey.properties;
      }

      const tool = new MetadataFormWidget(
        builtProperties,
        schema._origin,
        translator
      );

      notebookTools.addSection({
        sectionName: schema.label,
        rank: schema.rank,
        label: schema.label ?? schema.mainKey
      });

      tool.buildWidget();

      notebookTools.addItem({ section: schema.label, tool: tool });

      tools.push(tool);
    }
  }
}

/**
 * The metadata form plugin.
 */
const metadataForm: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [INotebookTools, ITranslator],
  optional: [ISettingRegistry],
  provides: IMetadataFormProvider,
  activate: async (
    app: JupyterFrontEnd,
    notebookTools: INotebookTools,
    translator: ITranslator,
    settings: ISettingRegistry | null
  ) => {
    console.log('Activating Metadata form');
    let tools: MetadataFormWidget[] = [];

    if (settings) {
      await Private.loadSettingsMetadataForm(
        app,
        tools,
        settings,
        notebookTools,
        translator
      );
    }

    console.log('Metadata form activated');
  }
};

export default metadataForm;
