// The share dialog: shows the text to share and copies or sends it.
export function createShareDialog() {
  const dialog = document.querySelector("#share-dialog");
  const title = document.querySelector("#share-title");
  const note = document.querySelector("#share-note");
  const textArea = document.querySelector("#share-text");
  const copyButton = document.querySelector("#copy-share");
  const nativeButton = document.querySelector("#native-share");

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textArea.value);
      copyButton.textContent = "Copied";
    } catch {
      textArea.select();
      copyButton.textContent = document.execCommand("copy") ? "Copied" : "Select and copy";
    }
  });

  nativeButton.addEventListener("click", async () => {
    try {
      await navigator.share({ text: textArea.value });
    } catch {
      // The person closed the share sheet; nothing to do.
    }
  });

  return {
    open(heading, description, text) {
      title.textContent = heading;
      note.textContent = description;
      textArea.value = text;
      nativeButton.hidden = typeof navigator.share !== "function";
      copyButton.textContent = "Copy";
      dialog.showModal();
    },
  };
}
