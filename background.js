"use strict";
let queue = Promise.resolve();
function serial(task) {
  const next = queue.then(task);
  queue = next.catch(console.error);
  return next;
}
async function readItems() {
  return (await browser.storage.local.get("items")).items || [];
}
function label(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 65).replace(/&/g, "&&");
}
async function rebuild(items) {
  await browser.menus.removeAll();
  browser.menus.create({id: "insert", title: "Вставить сохранёнку", contexts: ["editable"]});
  if (!items.length) browser.menus.create({id: "empty", parentId: "insert", title: "Пока пусто — добавьте текст в расширении", contexts: ["editable"], enabled: false});
  const groups = new Map();
  for (const item of items) {
    let parentId = "insert";
    if (item.group) {
      if (!groups.has(item.group)) {
        const id = `group-${groups.size}`;
        groups.set(item.group, id);
        browser.menus.create({id, parentId: "insert", title: label(item.group), contexts: ["editable"]});
      }
      parentId = groups.get(item.group);
    }
    browser.menus.create({id: `item-${item.id}`, parentId, title: label(item.title || item.text), contexts: ["editable"]});
  }
  browser.menus.create({id: "save-selection", title: "Сохранить выделенное в сохранёнки", contexts: ["selection"]});
}
async function store(items) {
  await browser.storage.local.set({items});
  await rebuild(items);
}
async function notify(message) {
  await browser.notifications.create({type: "basic", iconUrl: browser.runtime.getURL("icon.svg"), title: "Сохранёнки", message});
}
browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id || sender.tab) return undefined;
  return serial(async () => {
    const items = await readItems();
    if (message.type === "list") return items;
    if (message.type === "save") {
      const text = String(message.text || "");
      if (!text.trim()) throw new Error("Введите текст сохранёнки.");
      const item = {id: message.id || crypto.randomUUID(), title: String(message.title || "").trim(), group: String(message.group || "").trim(), text};
      const index = items.findIndex(entry => entry.id === item.id);
      if (index < 0) items.push(item); else items[index] = item;
      await store(items);
      return items;
    }
    if (message.type === "delete") {
      const remaining = items.filter(item => item.id !== message.id);
      await store(remaining);
      return remaining;
    }
    throw new Error("Неизвестная команда.");
  });
});
browser.menus.onClicked.addListener((info, tab) => {
  serial(async () => {
    if (info.menuItemId === "save-selection") {
      if (!info.selectionText?.trim()) return;
      const items = await readItems();
      items.push({id: crypto.randomUUID(), title: "", group: "", text: info.selectionText});
      await store(items);
      await notify("Выделенный текст сохранён. Название и группу можно изменить в окне расширения.");
    } else if (String(info.menuItemId).startsWith("item-")) {
      const item = (await readItems()).find(entry => `item-${entry.id}` === info.menuItemId);
      if (!item) throw new Error("Сохранёнка уже удалена.");
      await browser.tabs.executeScript(tab.id, {frameId: info.frameId, file: "insert.js"});
      const result = await browser.tabs.sendMessage(tab.id, {type: "insert-saved-text", targetElementId: info.targetElementId, text: item.text}, {frameId: info.frameId});
      if (!result?.ok) throw new Error(result?.error || "Не удалось вставить текст в это поле.");
    }
  }).catch(error => notify(`Не удалось выполнить действие: ${error.message}`));
});
serial(async () => rebuild(await readItems()));
