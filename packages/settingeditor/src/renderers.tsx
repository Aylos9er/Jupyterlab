import React from 'react';

import { FormControlLabel, InputLabel, Switch } from '@material-ui/core';

import {
  ArrayInput,
  DropDown,
  FormComponentRegistry,
  TextInput
} from '@jupyterlab/formeditor';

export const renderDropdown = (
  props: FormComponentRegistry.IRendererProps
): any => {
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
      {props.uihints.default !== props.value ? (
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
        onChange={(value: any): void => {
          props.handleChange(value);
        }}
      />
    </div>
  );
};

export const renderCheckbox = (
  props: FormComponentRegistry.IRendererProps
): any => {
  return (
    <div
      className="jp-FormComponent"
      key={`${props.uihints.title?.replace(' ', '')}BooleanInput`}
    >
      {props.uihints.default !== props.value ? (
        <div className="jp-modifiedIndicator" />
      ) : undefined}
      <FormControlLabel
        className="jp-metadataEditor-formInput"
        key={`${props.uihints.title?.replace(' ', '')}BooleanInput`}
        control={
          <Switch
            checked={props.value}
            onChange={(e: any, checked: boolean) => {
              props.handleChange(checked);
            }}
          />
        }
        label={props.uihints.title}
      />
    </div>
  );
};

export const renderStringArray = (
  props: FormComponentRegistry.IRendererProps
): any => {
  return (
    <div
      className="jp-metadataEditor-formInput jp-FormComponent"
      key={`${props.uihints.title?.replace(' ', '')}Array`}
      style={{ flexBasis: '100%' }}
    >
      <InputLabel> {props.uihints.title} </InputLabel>
      <ArrayInput
        onChange={(values: string[]) => {
          props.handleChange(values);
        }}
        values={props.value ?? ([] as string[])}
      />
    </div>
  );
};
