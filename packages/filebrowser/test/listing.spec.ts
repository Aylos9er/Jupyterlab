/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */

import expect from 'expect';
import { simulate } from 'simulate-event';
import { Signal } from '@lumino/signaling';
import { Widget } from '@lumino/widgets';
import { DocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { Mock, signalToPromise } from '@jupyterlab/testutils';
import { DirListing, FilterFileBrowserModel } from '../src';

// Returns the minimal args needed to create a new DirListing instance
const createOptionsForConstructor: () => DirListing.IOptions = () => ({
  model: new FilterFileBrowserModel({
    manager: new DocumentManager({
      registry: new DocumentRegistry(),
      opener: new Mock.DocumentWidgetOpenerMock(),
      manager: new Mock.ServiceManagerMock()
    })
  })
});

class TestDirListing extends DirListing {
  updated = new Signal<this, void>(this);
  onUpdateRequest(...args: any[]) {
    super.onUpdateRequest.apply(this, args);
    // Allows us to spy on onUpdateRequest.
    this.updated.emit();
  }
}

describe('filebrowser/listing', () => {
  describe('DirListing', () => {
    let dirListing: TestDirListing;

    beforeEach(async () => {
      const options = createOptionsForConstructor();

      // Start with some files instead of empty before creating the DirListing.
      // This makes it easier to test things, for example checking/unchecking
      // because after the DirListing is created, whenever a file is added, the
      // DirListing selects that file, which causes the file's checkbox to be
      // checked.
      await options.model.manager.newUntitled({ type: 'file' });
      await options.model.manager.newUntitled({ type: 'file' });
      await options.model.manager.newUntitled({ type: 'file' });
      await options.model.manager.newUntitled({ type: 'file' });

      // Create the widget and mount it to the DOM.
      dirListing = new TestDirListing(options);
      Widget.attach(dirListing, document.body);

      // Wait for the widget to update its internal DOM state before running
      // tests.
      await signalToPromise(dirListing.updated);
    });

    it('should reflect initial conditions', () => {
      // Check initial conditions
      const selectedItems = [...dirListing.selectedItems()];
      const sortedItems = [...dirListing.sortedItems()];
      expect(selectedItems).toHaveLength(0);
      expect(sortedItems).toHaveLength(4);
    });

    afterEach(() => {
      Widget.detach(dirListing);
      jest.restoreAllMocks();
    });

    describe('#constructor', () => {
      it('should return new DirListing instance', () => {
        const options = createOptionsForConstructor();
        const dirListing = new DirListing(options);
        expect(dirListing).toBeInstanceOf(DirListing);
      });
    });

    describe('#rename', () => {
      it('backspace during rename does not trigger goUp method', async () => {
        dirListing.selectNext();
        const newNamePromise = dirListing.rename();
        const goUpSpy = jest.spyOn(dirListing as any, 'goUp');
        const editNode = dirListing['_editNode'];
        simulate(editNode, 'keydown', {
          key: 'Backspace',
          keyCode: 8
        });
        // Can input node's value be changed with simulated key events?
        editNode.value = 'new_name.txt';
        simulate(editNode, 'keydown', {
          key: 'Enter',
          keyCode: 13
        });
        const newName = await newNamePromise;
        expect(newName).toBe('new_name.txt');
        expect(goUpSpy).not.toHaveBeenCalled();
      });

      it('should focus item after rename', async () => {
        dirListing.selectNext();
        const newNamePromise = dirListing.rename();
        const editNode = dirListing['_editNode'];
        // Give it a name that should put it at the bottom
        editNode.value = 'z.txt';
        simulate(editNode, 'keydown', {
          key: 'Enter',
          keyCode: 13
        });
        await newNamePromise;
        const sortedItems = [...dirListing.sortedItems()];
        const lastIndex = sortedItems.length - 1;
        expect(sortedItems[lastIndex].name).toBe('z.txt');
        const itemNode = dirListing['_items'][lastIndex];
        await signalToPromise(dirListing.updated);
        expect(itemNode.contains(document.activeElement)).toBe(true);
      });

      it('should keep focus on item after user presses escape key', async () => {
        dirListing.selectNext();
        const newNamePromise = dirListing.rename();
        const editNode = dirListing['_editNode'];
        simulate(editNode, 'keydown', {
          key: 'Escape',
          keyCode: 27
        });
        await newNamePromise;
        const itemNode = dirListing['_items'][0];
        expect(itemNode.contains(document.activeElement)).toBe(true);
      });
    });

    describe('#_handleMultiSelect', () => {
      it('should only select when to-index is same as from-index', () => {
        // to-index unselected
        dirListing['_focusItem'](1);
        expect(Object.keys(dirListing['selection'])).toHaveLength(0);
        dirListing['_handleMultiSelect'](1);
        expect(Object.keys(dirListing['selection'])).toHaveLength(1);

        // to-index selected
        dirListing['_selectItem'](1, false, true);
        const items = [...dirListing.sortedItems()];
        expect(dirListing['selection']).toHaveProperty([items[1].path], true);
        expect(Object.keys(dirListing['selection'])).toHaveLength(1);
        dirListing['_handleMultiSelect'](1);
        expect(dirListing['selection']).toHaveProperty([items[1].path], true);
        expect(Object.keys(dirListing['selection'])).toHaveLength(1);
      });

      describe('when to-index is selected', () => {
        // - to-index is 0
        // - from-index is 2
        beforeEach(() => {
          dirListing['_selectItem'](0, true);
          // This is outside our index range, but let's select it so we can test
          // that the function only affects the items in [from-index, to-index].
          dirListing['_selectItem'](3, true);
        });

        describe('when from-index and all items in-between are selected', () => {
          beforeEach(() => {
            dirListing['_selectItem'](1, true);
            dirListing['_selectItem'](2, true);
          });

          it('should leave to-index selected and unselect from-index and items in-between', () => {
            // Directory listing is like this:
            // 1. selected
            // 2. selected
            // 3. selected, focused
            // 4. selected
            expect(Object.keys(dirListing['selection'])).toHaveLength(4);
            dirListing['_handleMultiSelect'](0);
            // Now directory should look like:
            // - selected, unselected, unselected, selected
            const items = [...dirListing.sortedItems()];
            expect(Object.keys(dirListing['selection'])).toHaveLength(2);
            expect(dirListing['selection']).toHaveProperty(
              [items[0].path],
              true
            );
            expect(dirListing['selection']).toHaveProperty(
              [items[3].path],
              true
            );
          });
        });

        describe('when all are selected except from-index', () => {
          beforeEach(() => {
            dirListing['_selectItem'](1, true);
            dirListing['_focusItem'](2);
          });

          it('should leave to-index selected and unselect from-index and items in-between', () => {
            // Directory listing is like this:
            // 1. selected
            // 2. selected
            // 3. unselected, focused
            // 4. selected
            expect(Object.keys(dirListing['selection'])).toHaveLength(3);
            dirListing['_handleMultiSelect'](0);
            // Now directory should look like:
            // - selected, unselected, unselected, selected
            const items = [...dirListing.sortedItems()];
            expect(Object.keys(dirListing['selection'])).toHaveLength(2);
            expect(dirListing['selection']).toHaveProperty(
              [items[0].path],
              true
            );
            expect(dirListing['selection']).toHaveProperty(
              [items[3].path],
              true
            );
          });
        });

        describe('when from-index and some items in-between are not selected', () => {
          beforeEach(() => {
            dirListing['_focusItem'](2);
          });

          it('should select all in-between from- and to-index, leaving from-index unselected', () => {
            // Directory listing is like this:
            // 1. selected
            // 2. unselected
            // 3. unselected, focused
            // 4. selected
            expect(Object.keys(dirListing['selection'])).toHaveLength(2);
            dirListing['_handleMultiSelect'](0);
            // Now directory should look like:
            // - selected, selected, unselected, selected
            const items = [...dirListing.sortedItems()];
            expect(items).toHaveLength(4);
            expect(Object.keys(dirListing['selection'])).toHaveLength(3);
            expect(dirListing['selection']).not.toHaveProperty([items[2].path]);
          });
        });

        describe('when from-index is selected but some items in-between are not', () => {
          beforeEach(() => {
            dirListing['_selectItem'](2, true);
          });

          it('should select all in-between from- and to-index', () => {
            // Directory listing is like this:
            // 1. selected
            // 2. unselected
            // 3. selected, focused
            // 4. selected
            expect(Object.keys(dirListing['selection'])).toHaveLength(3);
            dirListing['_handleMultiSelect'](0);
            // Now directory should look like:
            // - selected, selected, selected, selected
            const items = [...dirListing.sortedItems()];
            expect(items).toHaveLength(4);
            expect(Object.keys(dirListing['selection'])).toHaveLength(4);
          });
        });
      });

      describe('when to-index is unselected', () => {
        // - to-index is 2
        // - from-index is 0

        beforeEach(() => {
          // This is outside our index range, but let's select it so we can test
          // that the function only affects the items in [from-index, to-index].
          dirListing['_selectItem'](3, true);
        });

        describe('when from-index and in-between items are selected', () => {
          beforeEach(() => {
            dirListing['_selectItem'](1, true);
            dirListing['_selectItem'](0, true);
          });

          it('should select all between from- and to-index', () => {
            // Directory listing is like this:
            // 1. selected, focused
            // 2. selected
            // 3. unselected [target]
            // 4. selected
            expect(Object.keys(dirListing['selection'])).toHaveLength(3);
            dirListing['_handleMultiSelect'](2);
            // Now directory should look like:
            // - selected, selected, selected, selected
            const items = [...dirListing.sortedItems()];
            expect(items).toHaveLength(4);
            expect(Object.keys(dirListing['selection'])).toHaveLength(4);
          });
        });

        describe('when from-index is unselected but in-between items are selected', () => {
          beforeEach(() => {
            dirListing['_selectItem'](1, true);
            dirListing['_focusItem'](0);
          });

          it('should select all between from- and to-index', () => {
            // Directory listing is like this:
            // 1. unselected, focused
            // 2. selected
            // 3. unselected [target]
            // 4. selected
            expect(Object.keys(dirListing['selection'])).toHaveLength(2);
            dirListing['_handleMultiSelect'](2);
            // Now directory should look like:
            // - unselected, selected, selected, selected
            const items = [...dirListing.sortedItems()];
            expect(items).toHaveLength(4);
            expect(Object.keys(dirListing['selection'])).toHaveLength(3);
            expect(dirListing['selection']).not.toHaveProperty([items[0].path]);
          });
        });
      });
    });

    describe('Enter key', () => {
      it('should not open an item unless it is selected', () => {
        // Meaning, do not open the item that is focussed if it is not also
        // selected.
        dirListing['_selectItem'](0, true);
        dirListing['_selectItem'](1, true);
        dirListing['_focusItem'](2);
        const handleOpenSpy = jest.spyOn(dirListing as any, 'handleOpen');
        const itemNode = dirListing['_items'][2];
        const nameNode = dirListing['_renderer'].getNameNode(itemNode);
        simulate(nameNode, 'keydown', {
          key: 'Enter',
          keyCode: 13
        });
        expect(handleOpenSpy).toHaveBeenCalledTimes(2);
        const sortedItems = [...dirListing.sortedItems()];
        expect(handleOpenSpy).toHaveBeenCalledWith(sortedItems[0]);
        expect(handleOpenSpy).toHaveBeenCalledWith(sortedItems[1]);
        expect(handleOpenSpy).not.toHaveBeenCalledWith(sortedItems[2]);
      });
    });

    describe('ArrowDown key', () => {
      let dirListing: TestDirListing;
      beforeEach(async () => {
        const options = createOptionsForConstructor();

        // Start with some files instead of empty before creating the DirListing.
        // This makes it easier to test checking/unchecking because after the
        // DirListing is created, whenever a file is added, the DirListing selects
        // that file, which causes the file's checkbox to be checked.
        await options.model.manager.newUntitled({ type: 'file' });
        await options.model.manager.newUntitled({ type: 'file' });
        await options.model.manager.newUntitled({ type: 'file' });

        // Create the widget and mount it to the DOM.
        dirListing = new TestDirListing(options);
        Widget.attach(dirListing, document.body);

        // Wait for the widget to update its internal DOM state before running
        // tests.
        await signalToPromise(dirListing.updated);
      });

      it('should select first item when nothing is selected', async () => {
        simulate(dirListing.node, 'keydown', {
          key: 'ArrowDown',
          keyCode: 40
        });
        await signalToPromise(dirListing.updated);
        const sortedItems = [...dirListing.sortedItems()];
        const selectedItems = [...dirListing.selectedItems()];
        expect(selectedItems).toHaveLength(1);
        expect(selectedItems[0]).toBe(sortedItems[0]);
      });

      it('should select second item once first item is selected', async () => {
        dirListing['_selectItem'](0, false);
        simulate(dirListing.node, 'keydown', {
          key: 'ArrowDown',
          keyCode: 40
        });
        await signalToPromise(dirListing.updated);
        const sortedItems = [...dirListing.sortedItems()];
        const selectedItems = [...dirListing.selectedItems()];
        expect(selectedItems).toHaveLength(1);
        expect(selectedItems[0]).toBe(sortedItems[1]);
      });

      describe('when pressing shift key and next item is selected', () => {
        it('should unselect if current item is selected and previous is unselected', async () => {
          dirListing['_selectItem'](2, true);
          dirListing['_selectItem'](1, true);
          // This should be the state:
          // - unselected
          // - selected, focussed
          // - selected
          await signalToPromise(dirListing.updated);
          simulate(dirListing.node, 'keydown', {
            key: 'ArrowDown',
            keyCode: 40,
            shiftKey: true
          });
          await signalToPromise(dirListing.updated);
          // Now it should be:
          // - unselected
          // - unselected
          // - selected, focussed
          const sortedItems = [...dirListing.sortedItems()];
          const selectedItems = [...dirListing.selectedItems()];
          expect(selectedItems).toHaveLength(1);
          expect(selectedItems[0]).toBe(sortedItems[2]);
        });

        it('should leave selected otherwise', async () => {
          dirListing['_selectItem'](0, true);
          dirListing['_selectItem'](2, true);
          dirListing['_selectItem'](1, true);
          // This should be the state:
          // - selected
          // - selected, focussed
          // - selected
          await signalToPromise(dirListing.updated);
          simulate(dirListing.node, 'keydown', {
            key: 'ArrowDown',
            keyCode: 40,
            shiftKey: true
          });
          await signalToPromise(dirListing.updated);
          // Now it should be:
          // - selected
          // - selected
          // - selected, focussed
          const sortedItems = [...dirListing.sortedItems()];
          const selectedItems = [...dirListing.selectedItems()];
          expect(selectedItems).toHaveLength(3);
          expect(sortedItems).toHaveLength(3);
        });
      });
    });

    describe('checkboxes', () => {
      describe('file/item checkbox', () => {
        it('should be checked after item is selected', async () => {
          const itemNode = dirListing.contentNode.children[0] as HTMLElement;
          const checkbox = dirListing.renderer.getCheckboxNode!(
            itemNode
          ) as HTMLInputElement;
          expect(checkbox.checked).toBe(false);
          dirListing.selectNext();
          await signalToPromise(dirListing.updated);
          expect(checkbox.checked).toBe(true);
        });

        it('should be unchecked after item is unselected', async () => {
          const itemNode = dirListing.contentNode.children[0] as HTMLElement;
          const checkbox = dirListing.renderer.getCheckboxNode!(
            itemNode
          ) as HTMLInputElement;
          dirListing.selectNext();
          await signalToPromise(dirListing.updated);
          expect(checkbox.checked).toBe(true);
          // Selecting the next item unselects the first.
          dirListing.selectNext();
          await signalToPromise(dirListing.updated);
          expect(checkbox.checked).toBe(false);
        });

        it('should allow selecting multiple items', async () => {
          const itemNodes = Array.from(
            dirListing.contentNode.children
          ) as HTMLElement[];
          // JSDOM doesn't render anything, which means that all the elements have
          // zero dimensions, so this is needed in order for the DirListing
          // mousedown handler to believe that the mousedown event is relevant.
          itemNodes[0].getBoundingClientRect = (): any => ({
            left: 0,
            right: 10,
            top: 0,
            bottom: 10
          });
          itemNodes[1].getBoundingClientRect = (): any => ({
            left: 0,
            right: 10,
            top: 10,
            bottom: 20
          });
          const checkboxes = itemNodes.map(node =>
            dirListing.renderer.getCheckboxNode!(node)
          ) as HTMLInputElement[];
          const items = Array.from(dirListing.sortedItems());
          expect(dirListing.isSelected(items[0].name)).toBe(false);
          expect(dirListing.isSelected(items[1].name)).toBe(false);
          simulate(checkboxes[0], 'mousedown', {
            clientX: 1,
            clientY: 1
          });
          simulate(checkboxes[1], 'mousedown', {
            clientX: 1,
            clientY: 11
          });
          await signalToPromise(dirListing.updated);
          expect(dirListing.isSelected(items[0].name)).toBe(true);
          expect(dirListing.isSelected(items[1].name)).toBe(true);
        });

        it('should reflect multiple items selected', async () => {
          const itemNodes = Array.from(
            dirListing.contentNode.children
          ) as HTMLElement[];
          const checkboxes = itemNodes.map(node =>
            dirListing.renderer.getCheckboxNode!(node)
          ) as HTMLInputElement[];
          expect(checkboxes[0].checked).toBe(false);
          expect(checkboxes[1].checked).toBe(false);
          dirListing.selectNext();
          dirListing.selectNext(true); // true = keep existing selection
          await signalToPromise(dirListing.updated);
          expect(checkboxes[0].checked).toBe(true);
          expect(checkboxes[1].checked).toBe(true);
        });

        // A double click on the item should open the item; however, a double
        // click on the checkbox should only check/uncheck the box.
        it('should not open item on double click', () => {
          const itemNode = dirListing.contentNode.children[0] as HTMLElement;
          const checkbox = dirListing.renderer.getCheckboxNode!(
            itemNode
          ) as HTMLInputElement;
          const wasOpened = jest.fn();
          dirListing.onItemOpened.connect(wasOpened);
          simulate(checkbox, 'dblclick');
          expect(wasOpened).not.toHaveBeenCalled();
          dirListing.onItemOpened.disconnect(wasOpened);
        });

        it('should not become unchecked due to right-click on selected item', async () => {
          const itemNode = dirListing.contentNode.children[0] as HTMLElement;
          itemNode.getBoundingClientRect = (): any => ({
            left: 0,
            right: 10,
            top: 0,
            bottom: 10
          });
          const checkbox = dirListing.renderer.getCheckboxNode!(
            itemNode
          ) as HTMLInputElement;
          const item = dirListing.sortedItems().next();
          await dirListing.selectItemByName(item.value.name);
          await signalToPromise(dirListing.updated);
          expect(checkbox.checked).toBe(true);
          expect(dirListing.isSelected(item.value.name)).toBe(true);
          simulate(checkbox, 'mousedown', {
            clientX: 1,
            clientY: 1,
            button: 2
          });
          await signalToPromise(dirListing.updated);
          // Item is still selected and checkbox is still checked after
          // right-click.
          expect(dirListing.isSelected(item.value.name)).toBe(true);
          expect(checkbox.checked).toBe(true);
        });

        // This essentially tests that preventDefault has been called on the click
        // handler (which also handles keyboard and touch "clicks" in addition to
        // mouse clicks). In other words, only the DirListing should check/uncheck
        // the checkbox, not the browser's built-in default handler for the click.
        it('should not get checked by the default action of a click', () => {
          const itemNode = dirListing.contentNode.children[0] as HTMLElement;
          const checkbox = dirListing.renderer.getCheckboxNode!(
            itemNode
          ) as HTMLInputElement;
          expect(checkbox.checked).toBe(false);
          simulate(checkbox, 'click', { bubbles: false });
          expect(checkbox.checked).toBe(false);
        });
      });

      describe('check-all checkbox', () => {
        it('should be unchecked when the current directory is empty', async () => {
          const { path } = await dirListing.model.manager.newUntitled({
            type: 'directory'
          });
          await dirListing.model.cd(path);
          await signalToPromise(dirListing.updated);
          const headerCheckbox = dirListing.renderer.getCheckboxNode!(
            dirListing.headerNode
          ) as HTMLInputElement;
          expect(headerCheckbox.checked).toBe(false);
          expect(headerCheckbox!.indeterminate).toBe(false);
        });

        describe('when previously unchecked', () => {
          const expectInitialConditions = () => {
            const headerCheckbox = dirListing.renderer.getCheckboxNode!(
              dirListing.headerNode
            ) as HTMLInputElement;
            expect(headerCheckbox.checked).toBe(false);
            expect(headerCheckbox!.indeterminate).toBe(false);
            expect(Array.from(dirListing.selectedItems())).toHaveLength(0);
          };
          it('should check all', async () => {
            expectInitialConditions();
            const headerCheckbox = dirListing.renderer.getCheckboxNode!(
              dirListing.headerNode
            ) as HTMLInputElement;
            simulate(headerCheckbox, 'click');
            await signalToPromise(dirListing.updated);
            expect(Array.from(dirListing.selectedItems())).toHaveLength(4);
          });
        });

        describe('when previously indeterminate', () => {
          beforeEach(async () => {
            dirListing.selectNext();
            await signalToPromise(dirListing.updated);
          });
          const expectInitialConditions = () => {
            const headerCheckbox = dirListing.renderer.getCheckboxNode!(
              dirListing.headerNode
            ) as HTMLInputElement;
            expect(headerCheckbox.indeterminate).toBe(true);
            expect(Array.from(dirListing.selectedItems())).toHaveLength(1);
          };
          it('should uncheck all', async () => {
            expectInitialConditions();
            const headerCheckbox = dirListing.renderer.getCheckboxNode!(
              dirListing.headerNode
            ) as HTMLInputElement;
            simulate(headerCheckbox, 'click');
            await signalToPromise(dirListing.updated);
            expect(Array.from(dirListing.selectedItems())).toHaveLength(0);
          });
        });

        describe('when previously checked', () => {
          beforeEach(async () => {
            // Select/check all items
            dirListing.selectNext(true);
            dirListing.selectNext(true);
            dirListing.selectNext(true);
            dirListing.selectNext(true);
            await signalToPromise(dirListing.updated);
          });
          const expectInitialConditions = () => {
            const headerCheckbox = dirListing.renderer.getCheckboxNode!(
              dirListing.headerNode
            ) as HTMLInputElement;
            expect(headerCheckbox.checked).toBe(true);
            expect(headerCheckbox.indeterminate).toBe(false);
            expect(Array.from(dirListing.selectedItems())).toHaveLength(4);
          };
          it('should uncheck all', async () => {
            expectInitialConditions();
            const headerCheckbox = dirListing.renderer.getCheckboxNode!(
              dirListing.headerNode
            ) as HTMLInputElement;
            simulate(headerCheckbox, 'click');
            await signalToPromise(dirListing.updated);
            expect(Array.from(dirListing.selectedItems())).toHaveLength(0);
          });
        });
      });
    });
  });
});
