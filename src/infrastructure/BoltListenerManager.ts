import { App } from "@slack/bolt";
const { v4: uuidv4 } = require('uuid');

export class BoltListenerManager {
  bolt: App;
  messageListeners: Map<string, (event: {event?}) => void>;
  actionListeners: Map<string, (context: any) => void>;

  constructor(bolt: App) {
    this.bolt = bolt;
    this.messageListeners = new Map();
    this.actionListeners = new Map();
    // Register a single handler that dispatches to all listeners
    this.bolt.event('message', async (message) => {
      for (const listener of this.messageListeners.values()) {
        try {
          await listener(message);
        } catch (e) {
          // Optionally log error
        }
      }
    });
    // Register a single action handler that dispatches to all listeners
    this.bolt.action(/.*/, async (context) => {
      if (
        "actions" in context.body &&
        Array.isArray((context.body as any).actions) &&
        (context.body as any).actions.length > 0
      ) {
        const blockId = (context.body as any).actions[0].block_id;
        if (blockId && this.actionListeners.has(blockId)) {
          try {
            await this.actionListeners.get(blockId)!(context);
          } catch (e) {
            // Optionally log error
          }
        }
      }
    });
  }

  get client() {
    return this.bolt.client;
  }

  /**
   * Add a message listener with optional channel and user filtering.
   * @param fn - The callback to invoke for matching messages
   * @param channel_id - Optional channel to filter messages
   * @param user_id - Optional user to filter messages
   * @returns The listener id
   */
  addMessageListener(
    fn: (event: {event?}) => void,
    channel_id?: string,
    user_id?: string
  ): string {
    const id = uuidv4();
    // Wrap the original fn with filtering logic
    const filteredFn = async (eventObj: {event?}) => {
      const event = eventObj.event;
      if (channel_id && event?.channel !== channel_id) return;
      if (user_id && event?.user !== user_id) return;
      await fn(eventObj);
    };
    this.messageListeners.set(id, filteredFn);
    return id;
  }

  /**
   * Add an action listener for a specific block_id.
   * @param block_id - The block_id to listen for
   * @param fn - The callback to invoke when the action is triggered
   * @returns The block_id (used for removal)
   */
  addActionListener(block_id: string, fn: (context: any) => void): string {
    this.actionListeners.set(block_id, fn);
    return block_id;
  }

  removeMessageListener(id: string) {
    this.messageListeners.delete(id);
  }

  removeActionListener(block_id: string) {
    this.actionListeners.delete(block_id);
  }

  event(eventName: string, ...listeners: any[]): void;
  event(eventName: RegExp, ...listeners: any[]): void;
  event(eventName: string | RegExp, ...listeners: any[]): void {
    return this.bolt.event(eventName as any, ...listeners);
  }

  action(actionIdOrConstraints: any, listener: any) {
    return this.bolt.action(actionIdOrConstraints, listener);
  }

  start() {
    return this.bolt.start();
  }
}
