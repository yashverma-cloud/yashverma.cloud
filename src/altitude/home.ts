/**
 * The home page's live descent. (Interim: shows the stills until the multi-scene flight lands.)
 */
export function bootHome(): void {
  const root = document.documentElement;
  if (root.dataset.mode === 'live') root.dataset.mode = 'still';
}
