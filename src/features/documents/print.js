const PRINTING_CLASS = "printing-protected-document";

export function printProtectedDocument() {
  document.body.classList.add(PRINTING_CLASS);
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    document.body.classList.remove(PRINTING_CLASS);
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  try {
    window.print();
  } finally {
    window.setTimeout(cleanup, 1_000);
  }
}
