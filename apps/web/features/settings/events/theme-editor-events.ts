type ThemeEditorOpenListener = () => void;

const listeners = new Set<ThemeEditorOpenListener>();

export function dispatchOpenThemeEditor(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeOpenThemeEditor(listener: ThemeEditorOpenListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
