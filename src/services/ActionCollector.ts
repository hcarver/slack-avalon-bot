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

  constructor(
    private actionService: IActionListenerService,
    private blockId: string,
    private playerIds: string[],
    private userIdLookup?: (playerId: string) => string
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
    this.listenerId = this.actionService.addActionListener(this.blockId, async (context) => {
      const userId = context.body.user.id;
      const action = context.body.actions[0];
      const actionValue = action.value;
      const channel = context.body.channel?.id;
      const messageTs = context.body.message?.ts;

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

      // Trigger UI update callback if provided
      if (onUpdate && channel && messageTs) {
        onUpdate(channel, messageTs, playerId);
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
   * Clean up the action listener
   */
  private cleanup(): void {
    if (this.listenerId) {
      this.actionService.removeActionListener(this.listenerId);
      this.listenerId = null;
    }
  }
}
