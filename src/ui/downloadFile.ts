/**
 * Handing the browser a file to save.
 *
 * Phaser has no notion of this, so — like `FileInputOverlay` for picking a file
 * and `LevelNameInput` for typing text — it is a real DOM element, created for
 * the one click and taken away again. Nothing is left over the canvas.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * in the same frame as the click can cancel the download in some browsers,
 * while never revoking leaks the whole blob for the life of the page — and a
 * bundle carrying a 4MB track is exactly the size where that matters.
 */
export function downloadTextFile(fileName: string, contents: string, mimeType = "application/json"): void {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  // Kept out of the layout entirely: this element exists only to be clicked.
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
