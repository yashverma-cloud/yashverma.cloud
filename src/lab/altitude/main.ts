/**
 * Entry. The mode is decided in the document head before first paint; this only loads the
 * live layer when the page asked for it. Still mode needs no script at all.
 */
export function boot(): void {
  const root = document.documentElement;
  if (root.dataset.mode !== 'live') return;
  import('./live')
    .then((m) => m.startLive())
    .catch((err) => {
      console.error('Altitude: live mode failed, showing the stills', err);
      root.dataset.mode = 'still';
    });
}
