/**
 * Entry. The mode is decided in the document head before first paint; this only loads the
 * live layer when the page asked for it. Still mode needs no script at all.
 */
export function boot(): void {
  const root = document.documentElement;
  // FlightHead falls back to still mode if this never runs.
  (window as unknown as Record<string, unknown>).__altBooted = true;
  if (root.dataset.mode !== 'live') return;
  import('./live')
    .then((m) => m.startLive())
    .catch((err) => {
      console.error('Altitude: live mode failed, showing the stills', err);
      root.dataset.mode = 'still';
    });
}
