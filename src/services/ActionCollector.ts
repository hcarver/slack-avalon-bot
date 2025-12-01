/**
 * Generic service for collecting user actions via Slack button clicks
 */
export class ActionCollector<T> {
  private resolvers: Map<string, (value: T) => void> = new Map();
  private promises: Map<string, Promise<T>> = new Map();
  private completed: Set<string> = new Set();
  private listenerId: string | null = null;

  constructor(
    private bolt: any,
    private blockId: string,
    private playerIds: string[]
  ) {
    // Create promises for each player
    playerIds.forEach(playerId => {
      const promise = new Promise<T>(resolve => {
        this.resolvers.set(playerId, resolve);
      });
      this.promises.set(playerId, promise);
    });
  }

  /**
   * Start collecting actions with a handler function
   * @param handler - Called when a player clicks a button. Should return the result value or null to ignore.
   * @param onUpdate - Optional callback triggered after each action (for UI updates)
   */
  start(
    handler: (userId: string, actionValue: string) => T | null,
    onUpdate?: () => void
  ): void {
    this.listenerId = this.bolt.addActionListener(this.blockId, async (context) => {
      const userId = context.body.user.id;
      const action = context.body.actions[0];
      const actionValue = action.value;

      // Ignore if player already completed or not in the list
      if (this.completed.has(userId)) return;
      if (!this.playerIds.includes(userId)) return;

      // Call handler to process the action
      const result = handler(userId, actionValue);
      if (result === null) return; // Handler rejected this action

      // Mark as completed
      this.completed.add(userId);

      // Trigger UI update callback if provided
      if (onUpdate) {
        onUpdate();
      }

      // Resolve the promise for this player
      const resolver = this.resolvers.get(userId);
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
  hasCompleted(userId: string): boolean {
    return this.completed.has(userId);
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
      this.bolt.removeActionListener(this.listenerId);
      this.listenerId = null;
    }
  }
}
