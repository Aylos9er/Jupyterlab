// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { Dialog, showDialog } from '@jupyterlab/apputils';
import { ServerConnection, ServiceManager } from '@jupyterlab/services';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { IConnectionLost } from './tokens';

/**
 * A default connection lost handler, which brings up an error dialog.
 */
export const ConnectionLost: IConnectionLost = async function (
  manager: ServiceManager.IManager,
  err: ServerConnection.NetworkError,
  translator?: ITranslator
): Promise<void> {
  translator = translator || nullTranslator;
  const trans = translator.load('jupyterlab');
  const title = trans.__('Server Connection Error');
  const networkMsg = trans.__(
    'A connection to the Jupyter server could not be established.\n' +
      'JupyterLab will continue trying to reconnect.\n' +
      'Check your network connection or Jupyter server configuration.\n'
  );
  const buttons = [Dialog.okButton({ label: trans.__('Dismiss') })];

  if (!Private.displayConnectionLost) {
    return;
  }

  let connectionDialog: Promise<void | Dialog.IResult<string>> | undefined =
    Private.serverConnectionLost;

  if (connectionDialog) {
    // Wait for the pre-existing promise to complete
    await connectionDialog;
    return;
  }

  const dialog = showDialog({
    title: title,
    body: networkMsg,
    checkbox: {
      label: trans.__('Do not show this message again in this session.'),
      caption: trans.__(
        'If checked, you will not see a dialog informing you about an issue with server connection in this session.'
      )
    },
    buttons: buttons
  })
    .then(result => {
      if (result.isChecked) {
        disableConnectionLostDialog();
      }
      return;
    })
    .catch(error => {
      console.error('An error occurred while showing the dialog: ', error);
    })
    .finally(() => {
      Private.serverConnectionLost = undefined;
    });

  setServerConnectionLost(dialog);

  return;
};

/**
 * The namespace for module private data.
 */
namespace Private {
  /**
   * Boolean determining if connection lost dialog is displayed.
   */
  export let displayConnectionLost = true;
  /**
   * The resulting connection lost dialog promise.
   */
  export let serverConnectionLost:
    | Promise<void | Dialog.IResult<string>>
    | undefined;
}
