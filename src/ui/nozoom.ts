/**
 * Keeps the browser from zooming the whole page, which is easy to do by accident with a pinch
 * or a double tap on the menus. The station's own pinch zoom runs on the scene and is unaffected.
 * CSS touch-action does most of this; these cover hosts and browsers that ignore it.
 */
export function blockPageZoom(): void {
  // Some hosts (like the app's artifact viewer) drop the page's viewport tag, so put it back.
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no';

  // A two-finger move anywhere is never a page zoom.
  document.addEventListener(
    'touchmove',
    (ev) => {
      if (ev.touches.length > 1 && ev.cancelable) ev.preventDefault();
    },
    { passive: false },
  );
  // Safari's own pinch events.
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (ev) => ev.preventDefault(), { passive: false });
  // Ctrl + wheel, and trackpad pinches, zoom the page on computers.
  window.addEventListener(
    'wheel',
    (ev) => {
      if (ev.ctrlKey) ev.preventDefault();
    },
    { passive: false },
  );
}
