import { IActionListenerService } from "../interfaces";

/**
 * Generic service for collecting user actions via Slack button clicks
 */
export class ActionCollector<T> {
  private resolvers: Map<string, (value: T) => void> = new Map();
  private promises: Map<string, Promise<T>> = new Map();
  private completed: Set<string> = new Set();
  private listenerId: string | null = null;
  private userIdToPlayerIds: Map<string, string[]> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private pendingCallbacks: Map<string, () => void> = new Map();
  private handler: ((playerId: string, actionValue: string) => T | null) | null = null;
  private onUpdate: ((channel: string, messageTs: string, playerId: string) => void) | null = null;
  private bulkActionMap: Map<string, string> = new Map();

  constructor(
    private actionService: IActionListenerService,
    private blockId: string,
    private playerIds: string[],
    private userIdLookup?: (playerId: string) => string,
    private debounceMs: number = 1500
  ) {
    // Create promises for each player
    playerIds.forEach(playerId => {
      const promise = new Promise<T>(resolve => {
        this.resolvers.set(playerId, resolve);
      });
      this.promises.set(playerId, promise);
      
      // Build userId -> playerId[] mapping
      if (userIdLookup) {
        const userId = userIdLookup(playerId);
        if (!this.userIdToPlayerIds.has(userId)) {
          this.userIdToPlayerIds.set(userId, []);
        }
        this.userIdToPlayerIds.get(userId)!.push(playerId);
      }
    });
  }

  /**
   * Start collecting actions with a handler function
   * @param handler - Called when a player clicks a button. Should return the result value or null to ignore.
   * @param onUpdate - Optional callback triggered after each action (for UI updates), receives channel and message ts
   */
  start(
    handler: (playerId: string, actionValue: string) => T | null,
    onUpdate?: (channel: string, messageTs: string, playerId: string) => void
  ): void {
    this.handler = handler;
    this.onUpdate = onUpdate || null;
    this.listenerId = this.actionService.addActionListener(this.blockId, async (context) => {
      const userId = context.body.user.id;
      const action = context.body.actions[0];
      const actionValue = action.value;
      const channel = context.body.channel?.id;
      const messageTs = context.body.message?.ts;

      // Handle bulk actions (e.g. dev shortcuts that resolve all pending players)
      const bulkTarget = this.bulkActionMap.get(actionValue);
      if (bulkTarget !== undefined) {
        this.completeAllPending(bulkTarget, channel, messageTs);
        return;
      }

      // Find the first uncompleted playerId for this userId
      let playerId: string | null = null;

      if (this.userIdLookup) {
        // Use the mapping to find playerIds for this userId
        const playerIdsForUser = this.userIdToPlayerIds.get(userId) || [];
        playerId = playerIdsForUser.find(pid => !this.completed.has(pid)) || null;
      } else {
        // Legacy mode: userId IS playerId
        playerId = this.playerIds.includes(userId) && !this.completed.has(userId) ? userId : null;
      }

      // Ignore if no valid playerId found
      if (!playerId) return;

      // Call handler to process the action
      const result = handler(playerId, actionValue);
      if (result === null) return; // Handler rejected this action

      // Mark as completed
      this.completed.add(playerId);

      // Trigger debounced UI update callback if provided
      if (onUpdate && channel && messageTs) {
        this.scheduleDebouncedUpdate(channel, messageTs, playerId, onUpdate);
      }

      // Resolve the promise for this player
      const resolver = this.resolvers.get(playerId);
      if (resolver) {
        resolver(result);
      }
    });
  }

  /**
   * Wait for all players to complete their actions
   */
  async waitForAll(): Promise<T[]> {
    const results = await Promise.all(this.promises.values());
    
    // Flush any pending debounced updates
    this.flushPendingUpdates();
    
    this.cleanup();
    return results;
  }

  /**
   * Wait for specific players to complete their actions
   */
  async waitFor(playerIds: string[]): Promise<T[]> {
    const selectedPromises = playerIds
      .map(id => this.promises.get(id))
      .filter(p => p !== undefined) as Promise<T>[];
    const results = await Promise.all(selectedPromises);
    
    // Flush any pending debounced updates
    this.flushPendingUpdates();
    
    this.cleanup();
    return results;
  }

  /**
   * Check if a player has completed their action
   */
  hasCompleted(playerId: string): boolean {
    return this.completed.has(playerId);
  }

  /**
   * Get the list of players who have completed
   */
  getCompleted(): string[] {
    return Array.from(this.completed);
  }

  /**
   * Get the list of players still pending
   */
  getPending(): string[] {
    return this.playerIds.filter(id => !this.completed.has(id));
  }

  /**
   * Register a bulk action that, when triggered, completes all pending players
   * with the given target action value.
   * @param triggerAction - The action_id value of the bulk button
   * @param targetAction - The action value to apply to each pending player
   */
  addBulkAction(triggerAction: string, targetAction: string): this {
    this.bulkActionMap.set(triggerAction, targetAction);
    return this;
  }

  private scheduleDebouncedUpdate(
    channel: string,
    messageTs: string,
    playerId: string,
    onUpdate: (channel: string, messageTs: string, playerId: string) => void
  ): void {
    const key = `${channel}-${messageTs}`;

    const existingTimer = this.debounceTimers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const callback = () => {
      onUpdate(channel, messageTs, playerId);
      this.debounceTimers.delete(key);
      this.pendingCallbacks.delete(key);
    };
    this.pendingCallbacks.set(key, callback);

    const timer = setTimeout(callback, this.debounceMs);
    this.debounceTimers.set(key, timer);
  }

  private completeAllPending(actionValue: string, channel?: string, messageTs?: string): void {
    if (!this.handler) return;
    const pending = this.getPending();
    for (const playerId of pending) {
      const result = this.handler(playerId, actionValue);
      if (result === null) continue;
      this.completed.add(playerId);
      const resolver = this.resolvers.get(playerId);
      if (resolver) resolver(result);
    }
    if (this.onUpdate && channel && messageTs) {
      this.scheduleDebouncedUpdate(channel, messageTs, pending[pending.length - 1], this.onUpdate);
    }
  }

  /**
   * Flush any pending debounced updates immediately
   */
  private flushPendingUpdates(): void {
    // Clear all timers
    this.debounceTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.debounceTimers.clear();
    
    // Execute all pending callbacks immediately
    this.pendingCallbacks.forEach((callback) => {
      callback();
    });
    this.pendingCallbacks.clear();
  }

  /**
   * Clean up the action listener
   */
  private cleanup(): void {
    if (this.listenerId) {
      this.actionService.removeActionListener(this.listenerId);
      this.listenerId = null;
    }
  }
}
