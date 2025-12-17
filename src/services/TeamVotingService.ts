import { webApi } from "@slack/bolt";
import { Player, TeamProposal } from "../types";
import { ActionCollector } from "./ActionCollector";
import { MessageBlockBuilder } from "../message-block-builder";
import { IActionListenerService } from "../interfaces";
import { ProposalHistoryEntry } from "../domain/GameState";

/**
 * Service for handling team proposal voting
 */
export class TeamVotingService {
  constructor(
    private api: webApi.WebClient,
    private actionService: IActionListenerService
  ) {}

  /**
   * Conduct a vote on a team proposal
   * @returns Object containing approval status and vote details
   */
  async voteOnTeam(
    proposal: TeamProposal,
    allPlayers: Player[],
    playerDms: Record<string, string>,
    questOrder: string[]
  ): Promise<{ approved: boolean; approveVotes: Player[]; rejectVotes: Player[] }> {
    // Send voting messages to all players and collect their message timestamps
    const playerMessages: Array<[Player, string]> = [];
    await Promise.all(allPlayers.map(async (p) => {
      const blocks = MessageBlockBuilder.createTeamVoteBlocks(
        proposal,
        allPlayers,
        p,
        [],
        [],
        questOrder
      );
      const resp = await this.api.chat.postMessage({
        channel: playerDms[p.playerId],
        blocks,
        text: `Team vote for ${questOrder[proposal.questNumber]} quest`
      });
      playerMessages.push([p, resp.ts as string]);
    }));

    // Collect votes using ActionCollector
    const approveVotes: Player[] = [];
    const rejectVotes: Player[] = [];
    
    const voteCollector = new ActionCollector<{ player: Player; approve: boolean }>(
      this.actionService,
      "quest-team-vote",
      allPlayers.map(p => p.playerId),
      (playerId) => allPlayers.find(p => p.playerId === playerId)!.userId
    );

    voteCollector.start(
      (playerId, actionValue) => {
        const player = allPlayers.find(p => p.playerId === playerId);
        if (!player) return null;
        
        const approve = actionValue === "approve";
        if (approve) approveVotes.push(player);
        else rejectVotes.push(player);
        
        return { player, approve };
      },
      (channel, messageTs, playerId) => {
        // Update all players' messages to show the new vote
        playerMessages.forEach(([p, ts]) => {
          const blocks = MessageBlockBuilder.createTeamVoteBlocks(
            proposal,
            allPlayers,
            p,
            approveVotes,
            rejectVotes,
            questOrder
          );
          this.api.chat.update({
            channel: playerDms[p.playerId],
            ts,
            blocks,
            text: `Team vote for ${questOrder[proposal.questNumber]} quest`
          });
        });
      }
    );

    await voteCollector.waitForAll();

    // After all votes are in, update quest history for all players
    playerMessages.forEach(([p, ts]) => {
      const blocks = MessageBlockBuilder.createTeamVoteHistoryBlocks(
        proposal,
        allPlayers,
        approveVotes,
        rejectVotes,
        questOrder
      );
      this.api.chat.update({
        channel: playerDms[p.playerId],
        ts,
        blocks,
        text: `Team vote result for ${questOrder[proposal.questNumber]} quest`
      });
    });

    const approved = approveVotes.length > rejectVotes.length;
    return { approved, approveVotes, rejectVotes };
  }
}
