// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { SourceChange } from '@jupyter/ydoc';
import { CompletionHandler } from './handler';
import {
  ICompletionContext,
  ICompletionProvider,
  IProviderReconciliator
} from './tokens';
import { Completer } from './widget';

/**
 * The reconciliator which is used to fetch and merge responses from multiple completion providers.
 */
export class ProviderReconciliator implements IProviderReconciliator {
  /**
   * Creates an instance of ProviderReconciliator.
   */
  constructor(options: ProviderReconciliator.IOptions) {
    this._providers = options.providers;
    this._context = options.context;
    this._timeout = options.timeout;
  }

  /**
   * Fetch response from multiple providers, If a provider can not return
   * the response for a completer request before timeout,
   * the result of this provider will be ignored.
   *
   * @param {CompletionHandler.IRequest} request - The completion request.
   */
  public async fetch(
    request: CompletionHandler.IRequest
  ): Promise<CompletionHandler.ICompletionItemsReply | null> {
    const current = ++this._fetching;
    let promises: Promise<CompletionHandler.ICompletionItemsReply | null>[] =
      [];
    for (const provider of this._providers) {
      let promise: Promise<CompletionHandler.ICompletionItemsReply | null>;
      promise = provider.fetch(request, this._context).then(reply => {
        if (current !== this._fetching) {
          return Promise.reject(void 0);
        }
        const items = reply.items.map(el => ({
          ...el,
          resolve: this._resolveFactory(provider, el)
        }));
        return { ...reply, items };
      });

      const timeoutPromise =
        new Promise<CompletionHandler.ICompletionItemsReply | null>(resolve => {
          return setTimeout(() => resolve(null), this._timeout);
        });
      promise = Promise.race([promise, timeoutPromise]);
      // Wrap promise and return error in case of failure.
      promises.push(promise.catch(p => p));
    }
    // TODO: maybe use `Promise.allSettled` once library is at es2020 instead of adding a catch.
    const combinedPromise = Promise.all(promises);
    return this._mergeCompletions(combinedPromise);
  }

  private _alignPrefixes(
    replies: CompletionHandler.ICompletionItemsReply[],
    minStart: number,
    maxStart: number
  ): CompletionHandler.ICompletionItemsReply[] {
    if (minStart != maxStart) {
      const editor = this._context.editor;
      if (!editor) {
        return replies;
      }
      const cursor = editor.getCursorPosition();
      const line = editor.getLine(cursor.line);
      if (!line) {
        return replies;
      }

      return replies.map(reply => {
        // No prefix to strip, return as-is.
        if (reply.start == maxStart) {
          return reply;
        }
        let prefix = line.substring(reply.start, maxStart);
        return {
          ...reply,
          items: reply.items.map(item => {
            let insertText = item.insertText || item.label;
            item.insertText = insertText.startsWith(prefix)
              ? insertText.slice(prefix.length)
              : insertText;
            return item;
          })
        };
      });
    }
    return replies;
  }

  private async _mergeCompletions(
    promises: Promise<(CompletionHandler.ICompletionItemsReply | null)[]>
  ): Promise<CompletionHandler.ICompletionItemsReply | null> {
    let replies = (await promises).filter(reply => {
      // Ignore it errors out.
      if (!reply || reply instanceof Error) {
        return false;
      }
      // Ignore if no matches.
      if (!reply.items.length) {
        return false;
      }
      // Otherwise keep.
      return true;
    }) as CompletionHandler.ICompletionItemsReply[];

    // Fast path for a single reply or no replies.
    if (replies.length == 0) {
      return null;
    } else if (replies.length == 1) {
      return replies[0];
    }

    const minEnd = Math.min(...replies.map(reply => reply.end));

    // If any of the replies uses a wider range, we need to align them
    // so that all responses use the same range.
    const starts = replies.map(reply => reply.start);
    const minStart = Math.min(...starts);
    const maxStart = Math.max(...starts);

    replies = this._alignPrefixes(replies, minStart, maxStart);

    const insertTextSet = new Set<string>();
    const mergedItems = new Array<CompletionHandler.ICompletionItem>();

    for (const reply of replies) {
      reply.items.forEach(item => {
        // IPython returns 'import' and 'import '; while the latter is more useful,
        // user should not see two suggestions with identical labels and nearly-identical
        // behaviour as they could not distinguish the two either way.
        let text = (item.insertText || item.label).trim();
        if (insertTextSet.has(text)) {
          return;
        }

        insertTextSet.add(text);
        mergedItems.push(item);
      });
    }
    return {
      start: maxStart,
      end: minEnd,
      items: mergedItems
    };
  }

  /**
   * Check if completer should make request to fetch completion responses
   * on user typing. If the provider with highest rank does not have
   * `shouldShowContinuousHint` method, a default one will be used.
   *
   * @param completerIsVisible - The visible status of completer widget.
   * @param changed - CodeMirror changed argument.
   */
  public shouldShowContinuousHint(
    completerIsVisible: boolean,
    changed: SourceChange
  ): boolean {
    if (this._providers[0].shouldShowContinuousHint) {
      return this._providers[0].shouldShowContinuousHint(
        completerIsVisible,
        changed
      );
    }
    return this._defaultShouldShowContinuousHint(completerIsVisible, changed);
  }

  private _defaultShouldShowContinuousHint(
    completerIsVisible: boolean,
    changed: SourceChange
  ): boolean {
    return (
      !completerIsVisible &&
      (changed.sourceChange == null ||
        changed.sourceChange.some(
          delta => delta.insert != null && delta.insert.length > 0
        ))
    );
  }

  private _resolveFactory = (
    provider: ICompletionProvider,
    el: CompletionHandler.ICompletionItem
  ) =>
    provider.resolve
      ? (patch?: Completer.IPatch) =>
          provider.resolve!(el, this._context, patch)
      : undefined;

  /**
   * List of available providers.
   */
  private _providers: Array<ICompletionProvider>;

  /**
   * Current completer context.
   */
  private _context: ICompletionContext;

  /**
   * Timeout for the fetch request.
   */
  private _timeout: number;

  /**
   * Counter to reject current provider response if a new fetch request is created.
   */
  private _fetching = 0;
}

export namespace ProviderReconciliator {
  /**
   * The instantiation options for provider reconciliator.
   */
  export interface IOptions {
    /**
     * Completion context that will be used in the `fetch` method of provider.
     */
    context: ICompletionContext;
    /**
     * List of completion providers, assumed to contain at least one provider.
     */
    providers: ICompletionProvider[];
    /**
     * How long should we wait for each of the providers to resolve `fetch` promise
     */
    timeout: number;
  }
}
