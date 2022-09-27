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
import { INotebookTools, NotebookTools } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';
import {
  IFormComponentRegistry,
  IFormWidgetRegistry
} from '@jupyterlab/ui-components';
import { ArrayExt } from '@lumino/algorithm';
import {
  JSONExt,
  PartialJSONArray,
  PartialJSONObject,
  PartialJSONValue,
  ReadonlyPartialJSONObject,
  ReadonlyPartialJSONValue
} from '@lumino/coreutils';
import { Message } from '@lumino/messaging';
import { SingletonLayout, Widget } from '@lumino/widgets';

import { IMetadataForm, IMetadataFormProvider } from './token';
import { FormWidget, MetadataForm } from './form';
import { IObservableJSON } from '@jupyterlab/observables';

export { IMetadataForm, IMetadataFormProvider };

const PLUGIN_ID = '@jupyterlab/metadataform-extension:metadataforms';

const UI_SCHEMA_PATTERN = /^ui\:.*/;

/**
 * A class that create a metadata form widget
 */
export class MetadataFormWidget
  extends NotebookTools.Tool
  implements IMetadataForm
{
  /**
   * Construct an empty widget.
   */
  constructor(
    builtProperties: MetadataForm.IProperties,
    metaInformation: MetadataForm.IMetaInformation,
    uiSchema: MetadataForm.IUiSchema,
    pluginId?: string,
    translator?: ITranslator
  ) {
    super();

    this._properties = builtProperties;
    this._metaInformation = metaInformation;
    this._uiSchema = uiSchema;
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
   * Get the list of existing metadataKey (array of array of string).
   */
  get metadataKeys(): MetadataForm.IMetadataKey[] {
    const metadataKeys: MetadataForm.IMetadataKey[] = [];
    for (let metaInfo of Object.values(this._metaInformation)) {
      metadataKeys.push(metaInfo.metadataKey);
    }
    return metadataKeys;
  }

  /**
   * Get the properties of a MetadataKey.
   * @param metadataKey - metadataKey (array of string).
   */
  getProperties(
    metadataKey: MetadataForm.IMetadataKey
  ): PartialJSONObject | null {
    const formKey = this.getFormKey(metadataKey);
    return JSONExt.deepCopy(this._properties.properties[formKey]) || null;
  }

  /**
   * Set properties to a metadataKey.
   * @param metadataKey - metadataKey (array of string).
   * @param properties - the properties to add or modify.
   */
  setProperties(
    metadataKey: MetadataForm.IMetadataKey,
    properties: PartialJSONObject
  ): void {
    const formKey = this.getFormKey(metadataKey);
    Object.entries(properties).forEach(([key, value]) => {
      this._properties.properties[formKey][key] = value;
    });
  }

  /**
   * Update the metadata of the current cell or notebook.
   *
   * @param formData: the cell metadata set in the form.
   * @param reload: whether to update the form after updating the metadata.
   *
   * ## Notes
   * Metadata are updated from root only. If some metadata is nested,
   * the whole root object must be updated.
   * This function build an object with all the root object to update
   * in metadata before performing update.
   */
  updateMetadata(formData: ReadonlyPartialJSONObject, reload?: boolean) {
    if (this.notebookTools == undefined) return;

    const notebook = this.notebookTools.activeNotebookPanel;

    const cell = this.notebookTools.activeCell;
    if (cell == null) return;

    this._updatingMetadata = true;

    // An object representing the cell metadata to modify.
    const cellMetadataObject: Private.IMetadataRepresentation = {};
    // An object representing the notebook metadata to modify.
    const notebookMetadataObject: Private.IMetadataRepresentation = {};

    for (let [formKey, value] of Object.entries(formData)) {
      if (
        this._metaInformation[formKey]?.level === 'notebook' &&
        this._notebookModelNull
      )
        continue;

      let currentMetadata: IObservableJSON;
      let metadataObject: Private.IMetadataRepresentation;

      // Linking the working variable to the corresponding metadata and representation.
      if (this._metaInformation[formKey]?.level === 'notebook') {
        // Working on notebook metadata.
        currentMetadata = notebook!.model!.metadata;
        metadataObject = notebookMetadataObject;
      } else {
        // Working on cell metadata.
        currentMetadata = cell.model.metadata;
        metadataObject = cellMetadataObject;
      }

      let metadataKey = this._metaInformation[formKey].metadataKey;
      let baseMetadataKey = metadataKey[0];
      if (baseMetadataKey == undefined) continue;

      let writeFinalData =
        value !== undefined && value !== this._metaInformation[formKey].default;

      // If metadata key is at root of metadata no need to go further.
      if (this._metaInformation[formKey].metadataKey.length == 1) {
        if (writeFinalData)
          metadataObject[baseMetadataKey] = value as PartialJSONValue;
        else metadataObject[baseMetadataKey] = undefined;
        continue;
      }

      let intermediateMetadataKeys = metadataKey.slice(1, -1);
      let finalMetadataKey = metadataKey[metadataKey.length - 1];

      // Deep copy of the metadata if not already done.
      if (!(baseMetadataKey in metadataObject)) {
        metadataObject[baseMetadataKey] = currentMetadata.toJSON()[
          baseMetadataKey
        ] as PartialJSONObject;
      }
      if (metadataObject[baseMetadataKey] === undefined)
        metadataObject[baseMetadataKey] = {};

      // Let's have an object which points to the nested key.
      let workingObject: PartialJSONObject = metadataObject[
        baseMetadataKey
      ] as PartialJSONObject;

      let finalObjectReached = true;

      for (let nested of intermediateMetadataKeys) {
        // If one of the nested object does not exist, this object is created only
        // if the aim is to write data at the end.
        if (!(nested in workingObject)) {
          if (!writeFinalData) {
            finalObjectReached = false;
            break;
          } else workingObject[nested] = {};
        }
        workingObject = workingObject[nested] as PartialJSONObject;
      }

      // Write the value to the nested key or remove all empty object before the nested key,
      // only if the final object has been reached.
      if (finalObjectReached) {
        if (!writeFinalData) delete workingObject[finalMetadataKey];
        else workingObject[finalMetadataKey] = value as PartialJSONValue;
      }

      // If the final nested data has been deleted, let see if there is not remaining
      // empty objects to remove.
      if (!writeFinalData) {
        metadataObject[baseMetadataKey] = Private.deleteEmptyNested(
          metadataObject[baseMetadataKey] as PartialJSONObject,
          metadataKey.slice(1)
        );
        if (
          !Object.keys(metadataObject[baseMetadataKey] as PartialJSONObject)
            .length
        )
          metadataObject[baseMetadataKey] = undefined;
      }
    }

    // Set the cell metadata or delete it if value is undefined or empty object.
    for (let [key, value] of Object.entries(cellMetadataObject)) {
      if (value === undefined) cell.model.metadata.delete(key);
      else cell.model.metadata.set(key, value as ReadonlyPartialJSONValue);
    }

    // Set the notebook metadata or delete it if value is undefined or empty object.
    if (!this._notebookModelNull) {
      for (let [key, value] of Object.entries(notebookMetadataObject)) {
        if (value === undefined) notebook!.model!.metadata.delete(key);
        else
          notebook!.model!.metadata.set(key, value as ReadonlyPartialJSONValue);
      }
    }

    this._updatingMetadata = false;

    if (reload) {
      this._update();
    }
  }

  /**
   * Get the formKey (the one used in form properties) corresponding to the metadataKey.
   * @param metadataKey - metadataKey (array of string).
   * @returns - the corresponding formKey (string).
   */
  protected getFormKey(metadataKey: MetadataForm.IMetadataKey): string {
    const entrySought = Object.entries(this._metaInformation).find(
      ([formKey, metaInfo]) => {
        return ArrayExt.shallowEqual(metadataKey, metaInfo.metadataKey);
      }
    );
    if (entrySought) return entrySought[0];
    return '';
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
  protected buildWidget(props: MetadataForm.IProps): void {
    const formWidget = new FormWidget(props, this._pluginId);
    formWidget.addClass('jp-MetadataForm');
    this.setContent(formWidget);
  }

  /**
   * Update the form when the widget is displayed.
   */
  protected onAfterShow(msg: Message): void {
    this._update();
  }

  /**
   * Handle a change to the active cell.
   */
  protected onActiveCellChanged(msg: Message): void {
    if (this.isVisible) this._update();
  }

  /**
   * Handle a change to the active cell metadata.
   */
  protected onActiveCellMetadataChanged(msg: Message): void {
    if (!this._updatingMetadata && this.isVisible) this._update();
  }

  protected onActiveNotebookPanelChanged(msg: Message): void {
    // Do not use notebook metadata if model is null.
    let notebook = this.notebookTools.activeNotebookPanel;
    if (notebook === null || notebook.model === null) {
      console.warn('Notebook model is null, its metadata cannot be updated.');
      this._notebookModelNull = true;
    } else {
      this._notebookModelNull = false;
    }
    if (!this._updatingMetadata && this.isVisible) this._update();
  }

  /**
   * Handle a change to the active notebook metadata.
   */
  protected onActiveNotebookPanelMetadataChanged(msg: Message): void {
    if (!this._updatingMetadata && this.isVisible) this._update();
  }

  /**
   * Update the form with current cell metadata, and remove inconsistent fields.
   */
  private _update(): void {
    const notebook = this.notebookTools.activeNotebookPanel;

    const cell = this.notebookTools.activeCell;
    if (cell == undefined) return;

    const builtProperties: MetadataForm.IProperties = {
      type: 'object',
      properties: {}
    };
    const formData = {} as PartialJSONObject;

    for (let [formKey, metaInfo] of Object.entries(this._metaInformation)) {
      // Do not display the field if it's Notebook metadata and the notebook model is null.
      if (metaInfo.level === 'notebook' && this._notebookModelNull) continue;

      // Do not display the field if the active cell's type is not involved.
      if (
        metaInfo.cellTypes &&
        !metaInfo.cellTypes?.includes(cell.model.type)
      ) {
        continue;
      }

      let workingObject: PartialJSONObject;
      let nestedKeys = metaInfo.metadataKey;
      builtProperties.properties[formKey] =
        this._properties.properties[formKey];

      // Associates the correct metadata to the working object.
      if (metaInfo.level === 'notebook') {
        workingObject = notebook!.model!.metadata.toJSON();
      } else {
        workingObject = cell.model.metadata.toJSON();
      }

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
        formData[formKey] = workingObject[nestedKeys[nestedKeys.length - 1]];
    }

    this.buildWidget({
      properties: builtProperties,
      metaInformation: this._metaInformation,
      uiSchema: this._uiSchema,
      translator: this.translator || null,
      formData: formData,
      formWidget: this
    });
  }

  protected translator: ITranslator;
  private _properties: MetadataForm.IProperties;
  private _metaInformation: MetadataForm.IMetaInformation;
  private _uiSchema: MetadataForm.IUiSchema;
  private _trans: TranslationBundle;
  private _placeholder: Widget;
  private _updatingMetadata: boolean;
  private _pluginId: string | undefined;
  private _notebookModelNull: boolean = false;
}

namespace Private {
  /**
   * The metadata representation object.
   */
  export interface IMetadataRepresentation {
    [metadata: string]: PartialJSONObject | PartialJSONValue | undefined;
  }

  /**
   *  This function reorders the metadataKeys using their rank if it is provided.
   *
   * @param metadataKeys - the array of metadataKeys to reorder.
   * @returns - the array of metadataKeys reordered
   */
  function reorderingFields(
    metadataKeys: ISettingRegistry.IMetadataKey[]
  ): ISettingRegistry.IMetadataKey[] {
    const ranked = metadataKeys
      .filter(metadataKey => metadataKey?.rank !== undefined)
      .sort((a, b) => (a.rank as number) - (b.rank as number));
    const orderedFields = metadataKeys.filter(
      metadataKey => metadataKey?.rank === undefined
    );
    ranked.forEach(metadataKey => {
      orderedFields.splice(metadataKey.rank as number, 0, metadataKey);
    });
    return orderedFields;
  }

  export async function loadSettingsMetadataForm(
    app: JupyterFrontEnd,
    tools: MetadataFormWidget[],
    registry: ISettingRegistry,
    notebookTools: INotebookTools,
    translator: ITranslator,
    formWidgetsRegistry: IFormWidgetRegistry,
    formComponentRegistry: IFormComponentRegistry
  ): Promise<{ [section: string]: MetadataFormWidget }> {
    let canonical: ISettingRegistry.ISchema | null;
    let loaded: { [name: string]: ISettingRegistry.IMetadataForm[] } = {};

    /**
     * Populate the plugin's schema defaults.
     */
    function populate(schema: ISettingRegistry.ISchema) {
      loaded = {};
      schema.properties!.metadataforms.default = Object.keys(registry.plugins)
        .map(plugin => {
          const metadataForms =
            registry.plugins[plugin]!.schema['jupyter.lab.metadataforms'] ?? [];

          metadataForms.forEach(metadataForm => {
            metadataForm._origin = plugin;
          });
          loaded[plugin] = metadataForms;
          return metadataForms;
        })
        .concat([schema['jupyter.lab.metadataforms'] as any[]])
        .reduce((acc, val) => {
          // If a MetadataForm with the same ID already exists,
          // the metadataKeys will be concatenated to this MetadataForm's metadataKeys .
          // Otherwise, the whole MetadataForm setting will be pushed as a new form.
          val.forEach(value => {
            const metadataForm = acc.find(addedValue => {
              return addedValue.id === value.id;
            });
            if (metadataForm) {
              metadataForm.metadataKeys = metadataForm.metadataKeys.concat(
                value.metadataKeys
              );
            } else {
              acc.push(value);
            }
          });
          return acc;
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
    const metadataForms: { [section: string]: MetadataFormWidget } = {};

    // Creates all the forms from extensions settings.
    for (let schema of settings.composite
      .metadataforms as ISettingRegistry.IMetadataForm[]) {
      let builtProperties: MetadataForm.IProperties = {
        type: 'object',
        properties: {}
      };
      let metaInformation: MetadataForm.IMetaInformation = {};
      let uiSchema: MetadataForm.IUiSchema = {};

      schema.metadataKeys = reorderingFields(schema.metadataKeys);

      for (let metadataSchema of schema.metadataKeys) {
        // Name of the key in RJSF schema.
        const formKey = metadataSchema.metadataKey.join('.');

        // Links the key to the path of the data in metadata.
        metaInformation[formKey] = {
          metadataKey: metadataSchema.metadataKey
        };

        // Links the key to its singular property.
        builtProperties.properties[formKey] = metadataSchema.properties;

        // Set the default value.
        metaInformation[formKey].default = metadataSchema.properties.default;

        // Initialize an uiSchema for that key.
        uiSchema[formKey] = {};

        // Get all ui:schema properties from the JSON file.
        for (let key in metadataSchema) {
          if (UI_SCHEMA_PATTERN.test(key))
            uiSchema[formKey][key] = metadataSchema[key];
        }

        // Optionally links key to cell type.
        if (metadataSchema['cellTypes']) {
          metaInformation[formKey].cellTypes = metadataSchema['cellTypes'];
        }

        // Optionally links key to metadata level.
        if (metadataSchema['metadataLevel']) {
          metaInformation[formKey].level = metadataSchema['metadataLevel'];
        }

        // Optionally links key to a custom widget.
        if (metadataSchema['customWidget']) {
          const formWidget = formWidgetsRegistry.getRenderer(
            metadataSchema['customWidget'] as string
          );

          // If renderer is defined (custom widget has been registered), set it as used widget.
          if (formWidget !== undefined)
            uiSchema[formKey]['ui:widget'] = formWidget;
        }

        // Optionally links key to a custom field.
        if (metadataSchema['customField']) {
          const formField = formComponentRegistry.getRenderer(
            metadataSchema['customField'] as string
          );

          // If renderer is defined (custom widget has been registered), set it as used widget.
          if (formField !== undefined)
            uiSchema[formKey]['ui:field'] = formField;
        }
      }

      // Adds a section to notebookTools.
      notebookTools.addSection({
        sectionName: schema.id,
        rank: schema.rank,
        label: schema.label ?? schema.id
      });

      // Creates the tool.
      const tool = new MetadataFormWidget(
        builtProperties,
        metaInformation,
        uiSchema,
        schema._origin,
        translator
      );

      // Adds the form to the section.
      notebookTools.addItem({ section: schema.id, tool: tool });

      tools.push(tool);
      metadataForms[schema.id] = tool;
    }
    return metadataForms;
  }

  /**
   * Recursive function to clean the empty nested metadata before updating real metadata.
   * this function is called when a nested metadata is undefined (or default), so maybe some
   * object are now empty.
   * @param metadataObject: PartialJSONObject representing the metadata to update.
   * @param metadataKeysList: Array<string> of the undefined nested metadata.
   * @returns PartialJSONObject without empty object.
   */
  export function deleteEmptyNested(
    metadataObject: PartialJSONObject,
    metadataKeysList: Array<string>
  ): PartialJSONObject {
    let metadataKey = metadataKeysList.shift();
    if (metadataKey !== undefined && metadataKey in metadataObject) {
      if (Object.keys(metadataObject[metadataKey] as PartialJSONObject).length)
        metadataObject[metadataKey] = deleteEmptyNested(
          metadataObject[metadataKey] as PartialJSONObject,
          metadataKeysList
        );
      if (!Object.keys(metadataObject[metadataKey] as PartialJSONObject).length)
        delete metadataObject[metadataKey];
    }
    return metadataObject;
  }
}

/**
 * The metadata form plugin.
 */
const metadataForm: JupyterFrontEndPlugin<
  { [section: string]: MetadataFormWidget } | undefined
> = {
  id: PLUGIN_ID,
  autoStart: true,
  requires: [
    INotebookTools,
    ITranslator,
    IFormWidgetRegistry,
    IFormComponentRegistry
  ],
  optional: [ISettingRegistry],
  provides: IMetadataFormProvider,
  activate: async (
    app: JupyterFrontEnd,
    notebookTools: INotebookTools,
    translator: ITranslator,
    widgetsRegistry: IFormWidgetRegistry,
    componentsRegistry: IFormComponentRegistry,
    settings: ISettingRegistry | null
  ): Promise<{ [section: string]: MetadataFormWidget } | undefined> => {
    console.log('Activating Metadata form');
    let tools: MetadataFormWidget[] = [];

    if (settings) {
      return await Private.loadSettingsMetadataForm(
        app,
        tools,
        settings,
        notebookTools,
        translator,
        widgetsRegistry,
        componentsRegistry
      );
    }

    console.log('Metadata form activated');
  }
};

export default metadataForm;
