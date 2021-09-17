/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import {
  FormComponentRegistry,
  FormEditor,
  IFormComponentRegistry
} from '@jupyterlab/ui-components';
import { ISchemaValidator, Settings } from '@jupyterlab/settingregistry';
import { PartialJSONObject } from '@lumino/coreutils';
import { showDialog } from '@jupyterlab/apputils';
import { CodeEditor } from '@jupyterlab/codeeditor';
import React from 'react';
import { Button } from '@jupyterlab/ui-components';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';

interface IProps {
  settings: Settings;
  componentRegistry: IFormComponentRegistry;
  editorFactory: CodeEditor.Factory;
  translator?: ITranslator;
}

/**
 * A React component that prepares the settings for a
 * given plugin to be rendered in the FormEditor.
 */
export const SettingsFormEditor = ({
  settings,
  componentRegistry,
  editorFactory,
  translator
}: IProps) => {
  const [schema, setSchema] = React.useState({} as FormEditor.ISchema);
  const [title, setTitle] = React.useState('');

  const trans = translator || nullTranslator;
  const _trans = trans.load('jupyterlab');

  /**
   * Handler for the "Restore to defaults" button - clears all
   * modified settings then calls `updateSchema` to restore the
   * values.
   */
  const reset = async () => {
    for (const field in settings.user) {
      await settings.remove(field);
    }
    updateSchema();
  };

  /**
   * Converts the schema info for a given field
   * to the expected values for the form editor.
   * @param options - Various UI info about the field
   * @param fieldName - The id of the field in the schema
   * @param category - Optional information if the field has a category
   * @returns Props for rendering the component in the form editor.
   */
  const getProperties = (
    options: any,
    fieldName: string,
    category?: { id: string; label: string }
  ): FormComponentRegistry.IRendererProps => {
    const props = {
      value: category?.id
        ? (settings.get(category?.id).composite as any)[fieldName]
        : settings.get(fieldName).composite,
      handleChange: (newValue: any) =>
        handleChange(fieldName, newValue, category?.id),
      uihints: {
        ...options,
        category: category,
        defaultValue: options.default,
        label: options.title ? _trans.__(options.title) : fieldName,
        options: options.enum,
        type: options.enum
          ? 'dropdown'
          : typeof options.type === 'object'
          ? options.type[0]
          : options.renderer_id ?? options.type ?? typeof options.default,
        title: options.title ? _trans.__(options.title) : fieldName
      }
    };
    if (props.uihints.type === 'object') {
      options.editorFactory = editorFactory;
    }
    return props;
  };

  /**
   * Updates the schema that's passed to the FormEditor component.
   * @param errors - Optional list of errors from the setting registry.
   * Used for rendering components with error indicators.
   */
  const updateSchema = (errors?: ISchemaValidator.IError[]) => {
    const properties: FormEditor.ISchema = {};
    setTitle(settings.schema.title ?? '');
    for (const prop in settings.schema.properties) {
      let ref = settings.schema.properties[prop]['$ref'] as string;
      let options = settings.schema.properties[prop];
      if (ref) {
        ref = ref.substring(14);
        options = {
          ...options,
          ...((settings.schema.definitions as PartialJSONObject)?.[
            ref
          ] as PartialJSONObject)
        };
      }
      if (options.properties && ref) {
        for (const subProp in options.properties) {
          const subOptions = options.properties[subProp];
          subOptions.default = (options.default as any)[subProp];
          if (errors) {
            const error = errors.filter(
              err => err.dataPath === `.${prop}.${subProp}`
            );
            subOptions.error = error?.[0]?.message;
          }
          properties[subProp] = getProperties(subOptions, subProp, {
            id: prop,
            label: options.title ? _trans.__(options.title) : prop
          });
        }
      } else {
        if (errors) {
          const error = errors.filter(err => err.dataPath === `.${prop}`);
          options.error = error?.[0]?.message;
        }
        properties[prop] = getProperties(options, prop);
      }
    }
    setSchema(properties);
  };

  React.useEffect(() => {
    updateSchema();
  }, []);

  /**
   * Handler for edits made in the form editor.
   * @param fieldName - ID of field being edited
   * @param value - New value for field
   * @param category - Optional category if field is under a category
   */
  const handleChange = (fieldName: string, value: any, category?: string) => {
    const current: any = settings.composite;
    if (category) {
      current[category][fieldName] = value;
    } else {
      current[fieldName] = value;
    }
    const errors = settings.validate(JSON.stringify(current));
    if (errors) {
      updateSchema(errors);
    } else {
      settings
        .set(
          category ?? fieldName,
          category ? current[category] : current[fieldName]
        )
        .then(() => {
          updateSchema();
        })
        .catch(reason =>
          showDialog({ title: 'Error saving settings.', body: reason })
        );
    }
  };

  return (
    <div className="jp-SettingsEditor">
      <div className="jp-SettingsHeader">
        <h1>{_trans.__(title)}</h1>
        {settings.isModified ? (
          <Button onClick={reset}> Restore to Defaults </Button>
        ) : undefined}
      </div>
      <FormEditor
        schema={schema}
        handleChange={handleChange}
        componentRegistry={componentRegistry}
      />
    </div>
  );
};
