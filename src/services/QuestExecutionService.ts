import { webApi } from "@slack/bolt";
import { Player, QuestResult, QuestAssignment } from "../types";
import { ActionCollector } from "./ActionCollector";
import { MessageBlockBuilder } from "../message-block-builder";
import { IActionListenerService } from "../interfaces";

/**
 * Service for handling quest execution
 */
export class QuestExecutionService {
  constructor(
    private api: webApi.WebClient,
    private actionService: IActionListenerService
  ) {}

  /**
   * Execute a quest with the given players
   * @returns QuestResult and arrays of failed/succeeded players
   */
  async executeQuest(
    questPlayers: Player[],
    allPlayers: Player[],
    leader: Player,
    questNumber: number,
    questProgress: QuestResult[],
    playerDms: Record<string, string>,
    questOrder: string[],
    questAssignments: QuestAssignment[],
    actionMessageTimestamps?: Map<string, string>
  ): Promise<{ failed: Player[]; succeeded: Player[] }> {
    // Use existing action messages or create new ones
    const playerMessages = new Map<string, string>();
    
    if (actionMessageTimestamps && actionMessageTimestamps.size > 0) {
      // Update existing action messages
      await Promise.all(allPlayers.map(async (p) => {
        const ts = actionMessageTimestamps.get(p.playerId);
        if (ts) {
          const blocks = MessageBlockBuilder.createQuestExecutionBlocks(
            questPlayers,
            allPlayers,
            p,
            leader,
            questNumber,
            [],
            questProgress,
            questOrder,
            questAssignments
          );
          await this.api.chat.update({
            channel: playerDms[p.playerId],
            ts,
            blocks,
            text: `${questOrder[questNumber]} quest`
          });
          playerMessages.set(p.playerId, ts);
        }
      }));
    } else {
      // Create new messages
      await Promise.all(allPlayers.map(async (p) => {
        const blocks = MessageBlockBuilder.createQuestExecutionBlocks(
          questPlayers,
          allPlayers,
          p,
          leader,
          questNumber,
          [],
          questProgress,
          questOrder,
          questAssignments
        );
        const resp = await this.api.chat.postMessage({
          channel: playerDms[p.playerId],
          blocks
        });
        playerMessages.set(p.playerId, resp.ts as string);
      }));
    }

    // 2. Collect quest votes from questing players
    const failed: Player[] = [];
    const succeeded: Player[] = [];

    const questCollector = new ActionCollector<{ player: Player; fail: boolean }>(
      this.actionService,
      "quest-success-vote",
      questPlayers.map(p => p.playerId),
      (playerId) => questPlayers.find(p => p.playerId === playerId)!.userId
    );

    questCollector.start(
      (playerId, actionValue) => {
        const player = questPlayers.find(p => p.playerId === playerId);
        if (!player) return null;
        
        const fail = actionValue === "fail";
        if (fail) failed.push(player);
        else succeeded.push(player);
        
        return { player, fail };
      },
      (channel, messageTs, playerId) => {
        // Update all players' messages to show the new vote
        allPlayers.forEach(p => {
          const blocks = MessageBlockBuilder.createQuestExecutionBlocks(
            questPlayers,
            allPlayers,
            p,
            leader,
            questNumber,
            questCollector.getCompleted(),
            questProgress,
            questOrder,
            questAssignments
          );
          this.api.chat.update({
            channel: playerDms[p.playerId],
            ts: playerMessages.get(p.playerId)!,
            blocks,
            text: `${questOrder[questNumber]} quest`
          });
        });
      }
    );

    await questCollector.waitForAll();

    return { failed, succeeded };
  }
}
