import { EventEmitter } from 'node:events';

/**
 * Central in-process event bus.
 * - The worker publishes check results and incident transitions.
 * - SSE endpoints subscribe to push real-time updates to browsers.
 */
export const events = new EventEmitter();
events.setMaxListeners(100);

/** Subscribe helper that returns an unsubscribe function. */
export function subscribe(eventName, handler) {
  events.on(eventName, handler);
  return () => events.off(eventName, handler);
}
