// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

/* eslint-disable */

/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run jlpm build:schema to regenerate this file.
 */

/**
 * which version of the spec this implements
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "current-version".
 */
export type SpecSchemaVersion = 2;
/**
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "env-var".
 *
 * This interface was referenced by `EnvironmentVariables`'s JSON-Schema definition
 * via the `patternProperty` "[^ ]+".
 */
export type AnEnvironmentVariableMayContainPythonStringTemplateEvaluatedAgainstTheExistingEnvironmentEG$HOME =
  string;
/**
 * the install commands or description for installing the language server
 *
 * This interface was referenced by `Installation`'s JSON-Schema definition
 * via the `patternProperty` ".+".
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "install-help".
 *
 * This interface was referenced by `Installation1`'s JSON-Schema definition
 * via the `patternProperty` ".+".
 */
export type InstallHelp = string;
/**
 * languages supported by this Language Server
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "language-list".
 */
export type LanguageList = [string, ...string[]];
/**
 * a description of a language server that could be started
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "language-server-spec".
 *
 * This interface was referenced by `LanguageServerSpecsMap`'s JSON-Schema definition
 * via the `patternProperty` ".*".
 */
export type LanguageServerSpec = ServerSpecProperties & {
  [k: string]: any;
};
/**
 * the arguments to start the language server normally
 */
export type LaunchArguments = string[];
/**
 * the arguments to start the language server with more verbose output
 */
export type DebugArguments = string[];
/**
 * name shown in the UI
 */
export type DisplayName = string;
/**
 * known extensions that can contribute to the Language Server's features
 */
export type Extensions = LanguageServerExtension[];
/**
 * list of MIME types supported by the language server
 */
export type MIMETypes = [string, ...string[]];
/**
 * information on troubleshooting the installation or auto-detection of the language server
 */
export type Troubleshooting = string;
/**
 * a date/time that might not have been recorded
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "nullable-date-time".
 */
export type NullableDateTime = string | null;
/**
 * the count of currently-connected WebSocket handlers
 */
export type HandlerCount = number;
/**
 * a list of tokens for running a command
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "shell-args".
 */
export type ShellArgs = string[];

/**
 * describes the current state of (potentially) running language servers
 */
export interface JupyterLspServerStatusResponse {
  [k: string]: any;
}
/**
 * a JSON schema to configure the Language Server or extension behavior from the client
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "client-config-schema".
 */
export interface ClientConfigurationSchema {
  [k: string]: any;
}
/**
 * a list of installation approaches keyed by package manager, e.g. pip, npm, yarn, apt
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "install-bundle".
 */
export interface Installation {
  [k: string]: InstallHelp;
}
/**
 * an extension which can extend the functionality of the language server and client
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "language-server-extension".
 */
export interface LanguageServerExtension {
  config_schema?: ClientConfigurationSchema;
  display_name?: string;
  install?: Installation;
  [k: string]: any;
}
/**
 * all properties that might be required to start and/or describe a Language Server
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "partial-language-server-spec".
 */
export interface ServerSpecProperties {
  argv?: LaunchArguments;
  config_schema?: ClientConfigurationSchema1;
  debug_argv?: DebugArguments;
  display_name?: DisplayName;
  env?: EnvironmentVariables;
  extend?: Extensions;
  /**
   * Whether to write un-saved documents to disk in a transient `.virtual_documents` directory. Well-behaved language servers that work against in-memory files should set this to `false`, which will become the default in the future.
   */
  requires_documents_on_disk?: boolean;
  install?: Installation1;
  languages?: LanguageList;
  mime_types?: MIMETypes;
  troubleshoot?: Troubleshooting;
  urls?: URLs;
  version?: SpecSchemaVersion;
  workspace_configuration?: WorkspaceConfiguration;
  [k: string]: any;
}
/**
 * a JSON schema to configure the Language Server behavior from the client
 */
export interface ClientConfigurationSchema1 {
  [k: string]: any;
}
/**
 * additional environment variables to set when starting the language server
 */
export interface EnvironmentVariables {
  [
    k: string
  ]: AnEnvironmentVariableMayContainPythonStringTemplateEvaluatedAgainstTheExistingEnvironmentEG$HOME;
}
/**
 * a list of installation approaches keyed by package manager, e.g. pip, npm, yarn, apt
 */
export interface Installation1 {
  [k: string]: InstallHelp;
}
/**
 * a collection of urls keyed by type, e.g. home, issues
 */
export interface URLs {
  [k: string]: string;
}
/**
 * default values to include in the client `workspace/configuration` reply (also known as `serverSettings`). User may override these defaults. The keys should be fully qualified (dotted) names of settings (nested specification is not supported).
 */
export interface WorkspaceConfiguration {
  [k: string]: any;
}
/**
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "servers-response".
 */
export interface ServersResponse {
  sessions: Sessions;
  specs?: LanguageServerSpecsMap;
  version: SpecSchemaVersion;
  [k: string]: any;
}
/**
 * named server sessions that are, could be, or were running
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "sessions".
 */
export interface Sessions {
  [k: string]: LanguageServerSession;
}
/**
 * a language server session
 *
 * This interface was referenced by `Sessions`'s JSON-Schema definition
 * via the `patternProperty` ".*".
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "session".
 */
export interface LanguageServerSession {
  handler_count: HandlerCount;
  /**
   * date-time of last seen message from a WebSocket handler
   */
  last_handler_message_at: string | null;
  /**
   * date-time of last seen message from the language server
   */
  last_server_message_at: string | null;
  spec: ServerSpecProperties;
  /**
   * a string describing the current state of the server
   */
  status: 'not_started' | 'starting' | 'started' | 'stopping' | 'stopped';
}
/**
 * a set of language servers keyed by their implementation name
 *
 * This interface was referenced by `JupyterLspServerStatusResponse`'s JSON-Schema
 * via the `definition` "language-server-specs-implementation-map".
 */
export interface LanguageServerSpecsMap {
  [k: string]: LanguageServerSpec;
}
