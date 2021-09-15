/* -----------------------------------------------------------------------------
| Copyright (c) Jupyter Development Team.
| Distributed under the terms of the Modified BSD License.
|----------------------------------------------------------------------------*/

import React from 'react';

import {
  ArrayInput,
  DropDown,
  FormComponentRegistry,
  TextInput
} from '@jupyterlab/formeditor';

import { JSONExt } from '@lumino/coreutils';
import { checkIcon } from '@jupyterlab/ui-components';

export const renderDropdown = (
  props: FormComponentRegistry.IRendererProps
): any => {
  props.uihints.options = props.uihints.enum;
  props.uihints.readonly = true;
  return (
    <div className="jp-FormComponent">
      {props.uihints.default !== props.value ? (
        <div className="jp-modifiedIndicator" />
      ) : undefined}
      <DropDown
        value={props.value}
        handleChange={props.handleChange}
        uihints={props.uihints}
      />
    </div>
  );
};

export const renderTextInput = (
  props: FormComponentRegistry.IRendererProps
): any => {
  return (
    <div className="jp-FormComponent">
      {!JSONExt.deepEqual(props.uihints.default, props.value) ? (
        <div className="jp-modifiedIndicator" />
      ) : undefined}
      <TextInput
        label={props.uihints.title}
        description={props.uihints.description}
        key={`${props.uihints.title?.replace(' ', '')}TextInput`}
        fieldName={props.uihints.title?.replace(' ', '')}
        numeric={props.uihints.field_type === 'number'}
        defaultValue={props.value || props.uihints.default || ''}
        secure={props.uihints.secure}
        defaultError={props.uihints.error}
        placeholder={props.uihints.placeholder}
        multiline={props.uihints.field_type === 'object'}
        onChange={(value: any): void => {
          if (
            (props.uihints.field_type === 'number' ||
              props.uihints.field_type === 'integer') &&
            !isNaN(value)
          ) {
            props.handleChange(parseInt(value));
          } else if (props.uihints.field_type === 'object') {
            try {
              props.handleChange(JSON.parse(value));
            } catch (e) {
              props.handleChange(value);
            }
          } else {
            props.handleChange(value);
          }
        }}
      />
    </div>
  );
};

export const renderCheckbox = (
  props: FormComponentRegistry.IRendererProps
): any => {
  const description = props.uihints.description ?? props.uihints.title;
  return (
    <div
      className="jp-FormComponent jp-metadataEditor-formInput jp-BooleanInput"
      key={`${props.uihints.title?.replace(' ', '')}BooleanInput`}
    >
      {props.uihints.default !== props.value ? (
        <div className="jp-modifiedIndicator" />
      ) : undefined}
      <h3>{props.uihints.title}</h3>
      <div className="jp-InputLabelWrapper">
        <checkIcon.react />
        <input
          type="checkbox"
          checked={props.value}
          onChange={(e: any) => {
            props.handleChange(!props.value);
          }}
        />
        <p
          onClick={(e: any) => {
            props.handleChange(!props.value);
          }}
        >
          {' '}
          {description}{' '}
        </p>
      </div>
    </div>
  );
};

export const renderStringArray = (
  props: FormComponentRegistry.IRendererProps
): any => {
  return (
    <div
      className="jp-metadataEditor-formInput jp-FormComponent jp-StringArrayInput"
      key={`${props.uihints.title?.replace(' ', '')}Array`}
      style={{ flexBasis: '100%' }}
    >
      {props.uihints.default !== props.value ? (
        <div className="jp-modifiedIndicator" />
      ) : undefined}
      <ArrayInput
        onChange={(values: string[]) => {
          props.handleChange(values);
        }}
        values={props.value ?? ([] as string[])}
        label={props.uihints.label}
      />
    </div>
  );
};
