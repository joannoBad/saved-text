"use strict";
const $ = (id) => document.getElementById(id);
let items = [];
let editing = null;
let busy = false;

function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}

function syncGroup() {
  const creating = $("group").value === "new";
  $("new-group-label").hidden = !creating;
  $("new-group").disabled = !creating;
  $("new-group").required = creating;
  $("new-group").setCustomValidity("");
}

function renderGroups() {
  const selected = $("group").value;
  const groups = [
    ...new Set(items.map((item) => item.group).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "ru"));
  const entries = [
    ["", "Без группы"],
    ...groups.map((group) => [`group:${group}`, group]),
    ["new", "＋ Добавить новую группу…"],
  ];
  $("group").replaceChildren(
    ...entries.map(([value, text]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      return option;
    }),
  );
  $("group").value = entries.some(([value]) => value === selected)
    ? selected
    : "";
  syncGroup();
}

function reset() {
  editing = null;
  $("editor").reset();
  $("group").value = "";
  syncGroup();
  $("heading").textContent = "Новая сохранёнка";
  $("cancel").hidden = true;
}

function render() {
  $("count").textContent = `(${items.length})`;
  renderGroups();
  const query = $("search").value.toLocaleLowerCase();
  const filtered = items.filter((item) =>
    `${item.title} ${item.group} ${item.text}`
      .toLocaleLowerCase()
      .includes(query),
  );
  $("items").replaceChildren();
  if (!filtered.length)
    $("items").textContent = items.length
      ? "Ничего не найдено."
      : "Пока пусто. Добавьте первую сохранёнку выше.";
  for (const item of filtered) {
    const row = document.createElement("article");
    const title = document.createElement("h3");
    title.textContent =
      item.title || item.text.replace(/\s+/g, " ").slice(0, 65);
    const group = document.createElement("small");
    group.textContent = item.group || "Без группы";
    const preview = document.createElement("p");
    preview.textContent =
      item.text.length > 160 ? `${item.text.slice(0, 160)}…` : item.text;
    const actions = document.createElement("div");
    actions.className = "actions";
    const edit = document.createElement("button");
    edit.textContent = "Изменить";
    edit.className = "secondary";
    edit.disabled = busy;
    edit.onclick = () => {
      editing = item.id;
      $("title").value = item.title;
      $("group").value = item.group ? `group:${item.group}` : "";
      $("new-group").value = "";
      syncGroup();
      $("text").value = item.text;
      $("heading").textContent = "Редактирование";
      $("cancel").hidden = false;
      $("text").focus();
    };
    const remove = document.createElement("button");
    remove.textContent = "Удалить";
    remove.className = "secondary";
    remove.disabled = busy;
    remove.onclick = () =>
      run(async () => {
        items = await browser.runtime.sendMessage({
          type: "delete",
          id: item.id,
        });
        if (editing === item.id) reset();
        status("Сохранёнка удалена.");
      });
    actions.append(edit, remove);
    row.append(title, group, preview, actions);
    $("items").append(row);
  }
}

async function run(task) {
  if (busy) return;
  busy = true;
  $("save").disabled = true;
  $("cancel").disabled = true;
  render();
  try {
    await task();
  } catch (error) {
    status(error.message, true);
  } finally {
    busy = false;
    $("save").disabled = false;
    $("cancel").disabled = false;
    render();
  }
}

$("editor").onsubmit = (event) => {
  event.preventDefault();
  const selected = $("group").value;
  const group =
    selected === "new" ? $("new-group").value.trim() : selected.slice(6);
  if (selected === "new" && !group) {
    $("new-group").setCustomValidity("Введите название новой группы.");
    $("new-group").reportValidity();
    return;
  }
  const message = {
    type: "save",
    id: editing,
    title: $("title").value,
    group,
    text: $("text").value,
  };
  run(async () => {
    items = await browser.runtime.sendMessage(message);
    reset();
    status("Сохранено. Текст доступен в контекстном меню.");
  });
};
$("cancel").onclick = reset;
$("search").oninput = render;
$("group").onchange = () => {
  syncGroup();
  if ($("group").value === "new") $("new-group").focus();
};
$("new-group").oninput = () => $("new-group").setCustomValidity("");
run(async () => {
  items = await browser.runtime.sendMessage({ type: "list" });
});
