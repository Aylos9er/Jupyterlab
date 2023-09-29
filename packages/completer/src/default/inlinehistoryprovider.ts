// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
import type {
  IInlineCompletionContext,
  IInlineCompletionProvider,
  InlineCompletionTriggerKind
} from '../tokens';
import type { CompletionHandler } from '../handler';
import { KernelMessage } from '@jupyterlab/services';
import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';

/**
 * An example inline completion provider using history to populate suggestions.
 */
export class HistoryInlineCompletionProvider
  implements IInlineCompletionProvider
{
  readonly identifier = 'history';

  constructor(protected options: HistoryInlineCompletionProvider.IOptions) {
    const translator = options.translator || nullTranslator;
    this._trans = translator.load('jupyterlab');
  }

  get name(): string {
    return this._trans.__('History');
  }

  async fetch(
    request: CompletionHandler.IRequest,
    context: IInlineCompletionContext,
    trigger?: InlineCompletionTriggerKind
  ) {
    const kernel = context.session?.kernel;

    if (!kernel) {
      throw new Error('No kernel for completion request.');
    }

    const historyRequest: KernelMessage.IHistoryRequestMsg['content'] = {
      output: false,
      raw: true,
      hist_access_type: 'tail',
      n: 500
    };

    // TODO: cache results
    const reply = await kernel.requestHistory(historyRequest);

    const items = [];
    const multiLinePrefix = request.text.slice(0, request.offset);
    const linePrefix = multiLinePrefix.split('\n').slice(-1)[0];
    if (linePrefix === '') {
      return { items: [] };
    }
    if (reply.content.status === 'ok') {
      for (const entry of reply.content.history) {
        const sourceLines = (entry[2] as string).split('\n');
        for (let i = 0; i < sourceLines.length; i++) {
          const line = sourceLines[i];
          if (line.startsWith(linePrefix)) {
            const followingLines =
              line.slice(linePrefix.length, line.length) +
              '\n' +
              sourceLines.slice(i + 1).join('\n');
            items.push({
              insertText: followingLines
            });
          }
        }
      }
    }

    return { items };
  }

  private _trans: TranslationBundle;
}

export namespace HistoryInlineCompletionProvider {
  export interface IOptions {
    translator?: ITranslator;
  }
}
