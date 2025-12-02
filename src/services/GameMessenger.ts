import { IMessageService } from "../interfaces";
import { Player } from "../types";

/**
 * Service for broadcasting messages to players in the game
 * Centralizes all message sending logic and provides consistent patterns
 */
export class GameMessenger {
  constructor(
    private messageService: IMessageService,
    private playerDms: Record<string, string>
  ) {}

  /**
   * Broadcast a message to all players with player-specific content
   * @param players - All players to send messages to
   * @param createBlocks - Function that creates blocks for each player
   * @param createText - Optional function to create fallback text for each player
   */
  async broadcastToAll(
    players: Player[],
    createBlocks: (player: Player) => any[],
    createText?: (player: Player) => string
  ): Promise<void> {
    await Promise.all(
      players.map(async (player) => {
        const blocks = createBlocks(player);
        const text = createText ? createText(player) : "Game update";
        
        await this.messageService.postMessage(
          this.playerDms[player.id],
          blocks,
          text
        );
      })
    );
  }

  /**
   * Broadcast the same message to all players
   * @param players - All players to send messages to
   * @param blocks - Message blocks to send
   * @param text - Fallback text
   */
  async broadcastSame(
    players: Player[],
    blocks: any[],
    text: string
  ): Promise<void> {
    await Promise.all(
      players.map(async (player) => {
        await this.messageService.postMessage(
          this.playerDms[player.id],
          blocks,
          text
        );
      })
    );
  }

  /**
   * Send a message to a single player
   * @param player - Player to send message to
   * @param blocks - Message blocks to send
   * @param text - Fallback text
   */
  async sendToPlayer(
    player: Player,
    blocks: any[],
    text: string
  ): Promise<void> {
    await this.messageService.postMessage(
      this.playerDms[player.id],
      blocks,
      text
    );
  }

  /**
   * Broadcast with personalized content and collect message timestamps
   * Useful when messages need to be updated later
   * @returns Map of player IDs to message timestamps
   */
  async broadcastAndCollectTimestamps(
    players: Player[],
    createBlocks: (player: Player) => any[],
    createText?: (player: Player) => string
  ): Promise<Map<string, string>> {
    const timestamps = new Map<string, string>();
    
    await Promise.all(
      players.map(async (player) => {
        const blocks = createBlocks(player);
        const text = createText ? createText(player) : "Game update";
        
        const ts = await this.messageService.postMessage(
          this.playerDms[player.id],
          blocks,
          text
        );
        
        timestamps.set(player.id, ts);
      })
    );
    
    return timestamps;
  }

  /**
   * Update messages for all players
   * @param players - All players whose messages should be updated
   * @param timestamps - Map of player IDs to message timestamps
   * @param createBlocks - Function that creates updated blocks for each player
   * @param createText - Optional function to create updated text for each player
   */
  async updateAll(
    players: Player[],
    timestamps: Map<string, string>,
    createBlocks: (player: Player) => any[],
    createText?: (player: Player) => string
  ): Promise<void> {
    players.forEach((player) => {
      const ts = timestamps.get(player.id);
      if (ts) {
        const blocks = createBlocks(player);
        const text = createText ? createText(player) : "Game update";
        
        this.messageService.updateMessage(
          this.playerDms[player.id],
          ts,
          blocks,
          text
        );
      }
    });
  }
}
