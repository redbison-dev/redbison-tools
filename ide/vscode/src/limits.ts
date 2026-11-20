/**
 * What the extension refuses to do, so it never becomes the reason an editor
 * feels slow.
 *
 * A tools plugin earns an uninstall by being in the way: freezing the window,
 * posting a 40MB selection over someone's tethered connection, or sitting in
 * memory holding things nobody asked for. These are the guard rails, in one
 * place so they can be stated and tested rather than assumed.
 */

/**
 * The most text that is sent over the network. A megabyte of selected text is
 * already far past what any of these tools is for, and past it the cost is
 * the reader's bandwidth and a long wait, not a useful answer. The hosted
 * page handles large input better than a round trip from the editor does.
 */
export const MAX_REMOTE_BYTES = 1_000_000;

/**
 * The most text handled locally. Ten times the remote cap because there is no
 * transfer cost, but still bounded: JSON.parse on a selection measured in
 * tens of megabytes blocks the extension host, and a frozen window is exactly
 * the experience this is avoiding.
 */
export const MAX_LOCAL_BYTES = 10_000_000;

export class TooLargeError extends Error {}

const mb = (n: number) => `${(n / 1_000_000).toFixed(n < 1_000_000 ? 1 : 0)}MB`;

/**
 * Throws when the selection is past what this command should take on.
 * The message says what to do instead rather than only what went wrong.
 */
export function checkSize(text: string, offline: boolean, toolTitle: string): void {
  // Byte length, not character count: a selection of CJK or emoji is two to
  // four times its length once encoded, and the network cares about bytes.
  const bytes = Buffer.byteLength(text, 'utf8');
  const cap = offline ? MAX_LOCAL_BYTES : MAX_REMOTE_BYTES;
  if (bytes <= cap) return;
  throw new TooLargeError(
    offline
      ? `The selection is ${mb(bytes)}, past the ${mb(cap)} this command handles in the editor. Open ${toolTitle} on redbison.dev for input this size.`
      : `The selection is ${mb(bytes)} and would be sent over the network. ${toolTitle} on redbison.dev handles input this size without the upload.`,
  );
}
