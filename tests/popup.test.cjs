const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

async function popup() {
  const elements = new Map();
  class Element {
    constructor() {
      this.value = "";
      this.children = [];
      this.classList = { toggle() {} };
    }
    replaceChildren(...children) {
      this.children = children;
    }
    append(...children) {
      this.children.push(...children);
    }
    setCustomValidity(message) {
      this.validationMessage = message;
    }
    reportValidity() {}
    focus() {}
    reset() {
      for (const id of ["title", "group", "new-group", "text"])
        get(id).value = "";
    }
  }
  function get(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  }
  let items = [
    { id: "1", title: "Ответ", group: "Работа", text: "Здравствуйте" },
    { id: "2", title: "Другое", group: "new", text: "Текст" },
  ];
  const messages = [];
  const context = vm.createContext({
    document: { getElementById: get, createElement: () => new Element() },
    browser: {
      runtime: {
        sendMessage: async (message) => {
          messages.push(message);
          if (message.type === "save") {
            const item = { ...message, id: message.id || "3" };
            items = items.filter((entry) => entry.id !== item.id).concat(item);
          }
          return items;
        },
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8"),
    context,
  );
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  await settle();
  return {
    get,
    messages,
    settle,
    submit: async () => {
      get("editor").onsubmit({ preventDefault() {} });
      await settle();
    },
  };
}
test("existing groups are selectable, including a group named new", async () => {
  const app = await popup();
  assert.ok(
    app.get("group").children.some((option) => option.value === "group:Работа"),
  );
  app.get("group").value = "group:new";
  app.get("group").onchange();
  assert.equal(app.get("new-group-label").hidden, true);
  await app.submit();
  assert.equal(app.messages.at(-1).group, "new");
});
test("new group is validated, trimmed, saved and added to dropdown", async () => {
  const app = await popup();
  app.get("group").value = "new";
  app.get("group").onchange();
  assert.equal(app.get("new-group").required, true);
  app.get("new-group").value = "   ";
  await app.submit();
  assert.equal(app.messages.length, 1);
  assert.ok(app.get("new-group").validationMessage);
  app.get("new-group").value = "  Личное  ";
  app.get("new-group").oninput();
  app.get("search").oninput();
  assert.equal(app.get("group").value, "new");
  assert.equal(app.get("new-group").value, "  Личное  ");
  await app.submit();
  assert.equal(app.messages.at(-1).group, "Личное");
  assert.ok(
    app.get("group").children.some((option) => option.value === "group:Личное"),
  );
  assert.equal(app.get("group").value, "");
  assert.equal(app.get("new-group").disabled, true);
});
test("editing preserves existing group and permits removing it", async () => {
  const app = await popup();
  app.get("items").children[0].children[3].children[0].onclick();
  assert.equal(app.get("group").value, "group:Работа");
  app.get("search").oninput();
  assert.equal(app.get("group").value, "group:Работа");
  app.get("group").value = "";
  app.get("group").onchange();
  await app.submit();
  assert.equal(app.messages.at(-1).id, "1");
  assert.equal(app.messages.at(-1).group, "");
});
