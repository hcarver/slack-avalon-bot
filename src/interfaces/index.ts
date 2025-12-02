/**
 * Interfaces for dependency injection
 * These abstractions allow for easier testing and swapping of implementations
 */

/**
 * Interface for sending messages to Slack channels
 */
export interface IMessageService {
  /**
   * Post a message to a channel
   * @param channel - Channel ID
   * @param blocks - Message blocks
   * @param text - Fallback text
   * @returns Promise with message timestamp
   */
  postMessage(channel: string, blocks: any[], text: string): Promise<string>;

  /**
   * Update an existing message
   * @param channel - Channel ID
   * @param ts - Message timestamp
   * @param blocks - Updated message blocks
   * @param text - Updated fallback text
   */
  updateMessage(channel: string, ts: string, blocks: any[], text: string): Promise<void>;
}

/**
 * Interface for managing Slack action listeners
 */
export interface IActionListenerService {
  /**
   * Add an action listener for a specific block ID
   * @param blockId - The block ID to listen for
   * @param handler - Handler function for the action
   * @returns Listener ID for cleanup
   */
  addActionListener(blockId: string, handler: (context: any) => Promise<void>): string;

  /**
   * Remove an action listener
   * @param listenerId - The listener ID to remove
   */
  removeActionListener(listenerId: string): void;
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Helper functions for Result type
 */
export const Result = {
  ok<T>(value: T): Result<T> {
    return { ok: true, value };
  },
  
  error<E = Error>(error: E): Result<never, E> {
    return { ok: false, error };
  },
  
  isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
    return result.ok;
  },
  
  isError<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
    return !result.ok;
  }
};
