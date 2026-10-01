const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function background() {
  let data = {}, message, click, counter = 0;
  const menu = new Map(), sent = [], scripts = [];
  const browser = {
    storage: {local: {get: async () => structuredClone(data), set: async value => { data = structuredClone(value); }}},
    menus: {removeAll: async () => menu.clear(), create: item => menu.set(item.id, item), onClicked: {addListener: fn => {click = fn;}}},
    runtime: {id: 'test', getURL: p => p, onMessage: {addListener: fn => {message = fn;}}},
    notifications: {create: async () => {}},
    tabs: {executeScript: async (id, options) => scripts.push({id, ...options}), sendMessage: async (id, msg, options) => {sent.push({id, msg, ...options}); return {ok: true};}}
  };
  vm.runInNewContext(source('background.js'), {browser, crypto: {randomUUID: () => String(++counter)}, console});
  return {menu, sent, scripts, send: msg => message(msg, {id: 'test'}), click: (...args) => click(...args)};
}
test('save, group menus, literal ampersands, edit and delete persist', async () => {
  const app = background();
  let items = await app.send({type: 'save', text: 'Hello\nworld', title: 'A&B', group: 'Replies'});
  assert.equal(app.menu.get('item-1').title, 'A&&B');
  assert.equal(app.menu.get('item-1').parentId, 'group-0');
  items = await app.send({type: 'save', id: items[0].id, text: 'Updated', group: ''});
  assert.equal(items.length, 1);
  assert.equal(app.menu.get('item-1').parentId, 'insert');
  await app.send({type: 'delete', id: items[0].id});
  assert.equal((await app.send({type: 'list'})).length, 0);
  assert.equal(app.menu.get('empty').enabled, false);
});
test('concurrent saves do not overwrite one another', async () => {
  const app = background();
  await Promise.all(Array.from({length: 10}, (_, i) => app.send({type: 'save', text: `Text ${i}`})));
  assert.equal((await app.send({type: 'list'})).length, 10);
});
test('selected text is preserved verbatim and insertion targets clicked frame', async () => {
  const app = background();
  app.click({menuItemId: 'save-selection', selectionText: '  line 1\nline 2  '}, {id: 7});
  const items = await app.send({type: 'list'});
  assert.equal(items[0].text, '  line 1\nline 2  ');
  app.click({menuItemId: `item-${items[0].id}`, frameId: 5, targetElementId: 99}, {id: 7});
  await app.send({type: 'list'});
  assert.equal(app.scripts[0].frameId, 5);
  assert.equal(app.sent[0].frameId, 5);
  assert.equal(app.sent[0].msg.targetElementId, 99);
  assert.equal(app.sent[0].msg.text, items[0].text);
});
function insertion() {
  let listener, target, installs = 0;
  class Input {
    constructor() { this.type = 'text'; this.isConnected = true; this.selectionStart = 2; this.selectionEnd = 4; this._value = 'abcdef'; this.events = []; }
    get value() { return this._value; } set value(v) { this._value = v; }
    focus() {} setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
    dispatchEvent(e) { this.events.push(e.type); return true; }
  }
  class Textarea extends Input {
    get value() { return this._value; } set value(v) { this._value = v; }
  }
  const context = vm.createContext({browser: {menus: {getTargetElement: () => target}, runtime: {onMessage: {addListener: fn => { listener = fn; installs++; }}}}, HTMLInputElement: Input, HTMLTextAreaElement: Textarea, InputEvent: class {constructor(type) {this.type = type;}}, document: {execCommand: () => false}});
  vm.runInContext(source('insert.js'), context);
  vm.runInContext(source('insert.js'), context);
  return {Input, Textarea, installs, insert: (element, text) => {target = element; return listener({type: 'insert-saved-text', targetElementId: 1, text});}};
}
test('fallback replaces selected text and dispatches input once; injection is idempotent', async () => {
  const app = insertion(), target = new app.Textarea();
  const result = await app.insert(target, 'X\nY');
  assert.equal(result.ok, true);
  assert.equal(target.value, 'abX\nYef');
  assert.equal(target.selectionStart, 5);
  assert.deepEqual(target.events, ['beforeinput', 'input']);
  assert.equal(app.installs, 1);
});
test('read-only, detached and unsupported input fields are rejected', async () => {
  const app = insertion();
  for (const props of [{readOnly: true}, {disabled: true}, {isConnected: false}, {type: 'number'}]) {
    const target = Object.assign(new app.Input(), props);
    assert.equal((await app.insert(target, 'X')).ok, false);
    assert.equal(target.value, 'abcdef');
  }
});
test('markup is inserted as literal text in fallback', async () => {
  const app = insertion(), target = new app.Input();
  await app.insert(target, '<script>alert(1)</script>');
  assert.equal(target.value, 'ab<script>alert(1)</script>ef');
});
