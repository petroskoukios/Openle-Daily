/* Shared DOM references and small UI utilities.
   Module scripts are deferred, so the document is fully parsed before this
   runs and getElementById is safe at module top level. */

export const input = document.getElementById("guessInput");
export const suggestEl = document.getElementById("suggest");

export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1900);
}

export function modal(id, open) {
  document.getElementById(id).classList.toggle("open", open);
}
