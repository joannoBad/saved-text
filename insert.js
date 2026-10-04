"use strict";
// This script is injected only after the user chooses a saved text.
if (!globalThis.savedTextInstalled) {
  globalThis.savedTextInstalled = true;
  browser.runtime.onMessage.addListener((message) => {
    if (message.type !== "insert-saved-text") return undefined;
    try {
      const target = browser.menus.getTargetElement(message.targetElementId);
      if (!target || !target.isConnected)
        throw new Error(
          "Поле больше не доступно. Откройте контекстное меню ещё раз.",
        );
      if (target.disabled || target.readOnly)
        throw new Error("Это поле недоступно для редактирования.");
      const text = message.text;
      if (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement
      ) {
        if (
          target instanceof HTMLInputElement &&
          !["text", "search", "url", "tel", "email", "password"].includes(
            target.type,
          )
        ) {
          throw new Error("Этот тип поля не поддерживает вставку текста.");
        }
        const start = target.selectionStart ?? target.value.length;
        const end = target.selectionEnd ?? start;
        target.focus({ preventScroll: true });
        if (target.selectionStart !== null)
          target.setSelectionRange(start, end);
        // Firefox's editing command preserves native undo and dispatches input.
        if (!document.execCommand("insertText", false, text)) {
          const event = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: "insertText",
            data: text,
          });
          if (!target.dispatchEvent(event))
            throw new Error("Вставка отменена редактором страницы.");
          const prototype =
            target instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const value =
            target.value.slice(0, start) + text + target.value.slice(end);
          Object.getOwnPropertyDescriptor(prototype, "value").set.call(
            target,
            value,
          );
          if (target.selectionStart !== null)
            target.setSelectionRange(start + text.length, start + text.length);
          target.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              composed: true,
              inputType: "insertText",
              data: text,
            }),
          );
        }
      } else if (target.isContentEditable) {
        let editor = target;
        while (editor.parentElement?.isContentEditable)
          editor = editor.parentElement;
        const selection = window.getSelection();
        const range = selection.rangeCount
          ? selection.getRangeAt(0).cloneRange()
          : null;
        const inside =
          range &&
          editor.contains(range.startContainer) &&
          editor.contains(range.endContainer);
        editor.focus({ preventScroll: true });
        selection.removeAllRanges();
        if (inside) selection.addRange(range);
        else {
          const end = document.createRange();
          end.selectNodeContents(editor);
          end.collapse(false);
          selection.addRange(end);
        }
        if (!document.execCommand("insertText", false, text))
          throw new Error("Редактор страницы не разрешил вставку текста.");
      } else throw new Error("Нажмите правой кнопкой внутри поля ввода.");
      return Promise.resolve({ ok: true });
    } catch (error) {
      return Promise.resolve({ ok: false, error: error.message });
    }
  });
}
