import { Player, QuestAssignment, Role, TeamProposal } from "./types";
import { RoleManager } from "./role-manager";

const M = require("./message-helpers");

export class MessageBlockBuilder {
  /**
   * Creates blocks for role assignment at game start
   */
  static createRoleInfoBlocks(
    player: Player,
    allPlayers: Player[],
    evils: Player[],
    knownEvils: Player[],
    assassinId: string,
    totalEvils: number,
    totalPlayers: number
  ): any[] {
    const blocks: any[] = [];
    
    // Header
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🎭 Your Role Assignment',
        emoji: true
      }
    });

    // Game setup info
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Game Setup:* ${totalEvils} evil vs ${totalPlayers - totalEvils} good\n*Total Players:* ${totalPlayers}`
      }
    });

    blocks.push({ type: 'divider' });

    // Role identity
    const isEvil = RoleManager.isEvilPlayer(player.role!);
    const roleEmoji = RoleManager.getRoleEmoji(player.role!);
    const roleName = RoleManager.getRoleName(player.role!);
    const alignment = isEvil ? "🔴 Evil" : "🔵 Good";
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${roleEmoji} *You are ${roleName}*\n*Alignment:* ${alignment}`
      }
    });

    // Assassin notification
    if (assassinId === player.id && player.role !== "assassin") {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚔️ *You are also THE ASSASSIN*\nIf good wins 3 quests, you can try to kill Merlin.`
        }
      });
    }

    // Role-specific information
    const roleInfo = RoleManager.getRoleSpecificInfo(player, allPlayers, evils, knownEvils);
    if (roleInfo) {
      blocks.push({ type: 'divider' });
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*🔍 Your Knowledge:*\n${roleInfo}`
        }
      });
    }

    // Role objective
    const roleObjective = RoleManager.getRoleObjective(player.role!);
    if (roleObjective) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `💡 _${roleObjective}_`
        }]
      });
    }

    return blocks;
  }

  /**
   * Creates blocks for end game display
   */
  static createEndGameBlocks(
    victoryMessage: string,
    players: Player[],
    progress: string[],
    questOrder: string[]
  ): any[] {
    const blocks: any[] = [];
    
    // Determine winner
    const evilWins = victoryMessage.includes("Minions of Mordred win");
    const winnerEmoji = evilWins ? "🔴" : "🔵";
    const winnerText = evilWins ? "EVIL WINS!" : "GOOD WINS!";
    
    // Victory header
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${winnerEmoji} GAME OVER - ${winnerText}`,
        emoji: true
      }
    });

    // Victory message
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${victoryMessage}*`
      }
    });

    blocks.push({ type: 'divider' });

    // Final quest results
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Final Quest Results:*'
      }
    });
    blocks.push(...this.createQuestProgressBlocks(progress, questOrder, false));

    blocks.push({ type: 'divider' });

    // Role reveals
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🎭 Role Reveals:*'
      }
    });

    // Group players by team
    const evilPlayers = [];
    const goodPlayers = [];
    
    for (let player of players) {
      const roleEmoji = RoleManager.getRoleEmoji(player.role!);
      const roleName = RoleManager.getRoleName(player.role!);
      const playerInfo = `${roleEmoji} ${M.formatAtUser(player.id)} - *${roleName}*`;
      
      if (RoleManager.isGoodPlayer(player.role!)) {
        goodPlayers.push(playerInfo);
      } else {
        evilPlayers.push(playerInfo);
      }
    }

    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*🔵 Good Team:*\n${goodPlayers.join('\n')}`
        },
        {
          type: 'mrkdwn',
          text: `*🔴 Evil Team:*\n${evilPlayers.join('\n')}`
        }
      ]
    });

    // Game stats
    let score = { good: 0, bad: 0 };
    for (let res of progress) {
      score[res]++;
    }
    
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Game ended with ${score.good} quest${score.good !== 1 ? 's' : ''} succeeded, ${score.bad} quest${score.bad !== 1 ? 's' : ''} failed`
      }]
    });

    return blocks;
  }

  /**
   * Creates blocks for quest progress display
   */
  static createQuestProgressBlocks(
    progress: string[],
    questOrder: string[],
    current: boolean = false,
    questAssignments?: QuestAssignment[],
    currentQuestNum?: number
  ): any[] {
    const blocks = [];
    const questParts = [];

    for (let i = 0; i < 5; i++) {
      let icon = "⚪";
      const questName = questOrder[i].charAt(0).toUpperCase() + questOrder[i].slice(1);
      
      let numPlayers = "";
      if (questAssignments) {
        const assignment = questAssignments[i];
        numPlayers = ` (${assignment.n}${assignment.f > 1 ? '*' : ''})`;
      }

      if (i < progress.length) {
        icon = progress[i] === "good" ? "🔵" : "🔴";
      } else if (current && currentQuestNum !== undefined && i === currentQuestNum) {
        icon = "⚫";
      }

      questParts.push(`${icon} ${questName}${numPlayers}`);
    }

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: questParts.join("  •  ")
      }
    });

    // Legend
    const legend = "🔵 Success  •  🔴 Failed  •  ⚫ Current  •  ⚪ Pending  •  * = 2 fails required";
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: legend }]
    });

    return blocks;
  }

  /**
   * Creates blocks for quest result broadcast
   */
  static createQuestResultBlocks(
    questPlayers: Player[],
    result: "success" | "failure",
    failCount: number,
    failsRequired: number,
    questName: string,
    progress: string[],
    questOrder: string[],
    questAssignments: QuestAssignment[],
    currentQuestNum: number
  ): any[] {
    const blocks: any[] = [];
    
    // Header
    const resultEmoji = result === "success" ? "✅" : "❌";
    const resultText = result === "success" ? "SUCCESS" : "FAILED";
    
    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${resultEmoji} ${questName} Quest ${resultText}`,
        emoji: true
      }
    });

    // Quest team
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Quest Team:* ${M.pp(questPlayers)}`
      }
    });

    // Result details
    let resultDetails = '';
    if (result === "success") {
      if (failCount === 0) {
        resultDetails = `🎉 *All team members succeeded!*\nThe quest passes.`;
      } else {
        resultDetails = `⚠️ *${failCount} fail vote${failCount > 1 ? 's' : ''} received*\nNot enough to fail the quest (${failsRequired} required). The quest succeeds!`;
      }
    } else {
      resultDetails = `💀 *${failCount} fail vote${failCount > 1 ? 's' : ''} received*\n${failsRequired > 1 ? `${failsRequired} fails were required. ` : ''}The quest fails!`;
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: resultDetails
      }
    });

    // Updated quest progress
    blocks.push({ type: 'divider' });
    blocks.push(...this.createQuestProgressBlocks(progress, questOrder, false, questAssignments, currentQuestNum));

    // Score update
    let score = { good: 0, bad: 0 };
    for (let res of progress) {
      score[res]++;
    }
    
    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Current Score: ${score.good} quest${score.good !== 1 ? 's' : ''} succeeded, ${score.bad} quest${score.bad !== 1 ? 's' : ''} failed`
      }]
    });

    return blocks;
  }

  /**
   * Creates blocks for assassination phase announcement
   */
  static createAssassinationAnnouncementBlocks(assassinId: string): any[] {
    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚔️ ASSASSINATION PHASE',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔵 Good has won 3 quests, but the game isn't over yet!\n\n⚔️ *${M.formatAtUser(assassinId)}* is THE ASSASSIN and can now attempt to kill MERLIN.\n\nIf the Assassin correctly identifies Merlin, 🔴 Evil wins!\nIf the Assassin is wrong, 🔵 Good wins!`
        }
      }
    ];
  }

  /**
   * Creates blocks for assassination result
   */
  static createAssassinationResultBlocks(
    assassinId: string,
    targetId: string,
    merlinId: string,
    wasCorrect: boolean,
    players: Player[],
    progress: string[],
    questOrder: string[],
    questAssignments: QuestAssignment[]
  ): any[] {
    const resultBlocks: any[] = [];
    
    if (!wasCorrect) {
      resultBlocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔵 GOOD WINS!',
          emoji: true
        }
      });
      resultBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚔️ ${M.formatAtUser(assassinId)} assassinated ${M.formatAtUser(targetId)}, but...\n\n❌ *They were NOT Merlin!*\n\n👼 The real Merlin was ${M.formatAtUser(merlinId)}\n\n🔵 *Loyal Servants of Arthur win!*`
        }
      });
    } else {
      resultBlocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🔴 EVIL WINS!',
          emoji: true
        }
      });
      resultBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚔️ ${M.formatAtUser(assassinId)} assassinated ${M.formatAtUser(targetId)}\n\n✅ *They correctly identified Merlin!*\n\n🔴 *Minions of Mordred win!*`
        }
      });
    }

    resultBlocks.push({ type: 'divider' });
    resultBlocks.push(...this.createQuestProgressBlocks(progress, questOrder, false, questAssignments));
    resultBlocks.push({ type: 'divider' });

    // Role reveals
    resultBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🎭 Role Reveals:*'
      }
    });

    const evilPlayers = [];
    const goodPlayers = [];
    
    for (let player of players) {
      const roleEmoji = RoleManager.getRoleEmoji(player.role!);
      const roleName = RoleManager.getRoleName(player.role!);
      const playerInfo = `${roleEmoji} ${M.formatAtUser(player.id)} - *${roleName}*`;
      
      if (RoleManager.isGoodPlayer(player.role!)) {
        goodPlayers.push(playerInfo);
      } else {
        evilPlayers.push(playerInfo);
      }
    }

    resultBlocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*🔵 Good Team:*\n${goodPlayers.join('\n')}`
        },
        {
          type: 'mrkdwn',
          text: `*🔴 Evil Team:*\n${evilPlayers.join('\n')}`
        }
      ]
    });

    return resultBlocks;
  }

  /**
   * Creates a progress bar
   */
  static createProgressBar(current: number, total: number, length: number = 10): string {
    const filled = Math.floor((current / total) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Creates blocks for team vote history (after voting completes)
   */
  static createTeamVoteHistoryBlocks(
    proposal: TeamProposal,
    allPlayers: Player[],
    approvingPlayers: Player[],
    rejectingPlayers: Player[],
    questOrder: string[]
  ): any[] {
    const M = require("./message-helpers");
    const teamNomination = `${M.formatAtUser(proposal.leader.id)} nominated ${M.pp(
      proposal.members,
    )} for the ${questOrder[proposal.questNumber]} quest`;

    // Build player status list with icons
    const playerStatusList = allPlayers.map(p => {
      if (approvingPlayers.some(ap => ap.id === p.id)) {
        return `✅ ${M.formatAtUser(p.id)}`;
      } else if (rejectingPlayers.some(rp => rp.id === p.id)) {
        return `❌ ${M.formatAtUser(p.id)}`;
      } else {
        return `⬜ ${M.formatAtUser(p.id)}`;
      }
    }).join('\n');

    // Determine final result
    let statusText = '';
    if (approvingPlayers.length > rejectingPlayers.length) {
      statusText = `✅ *Team Accepted* (${approvingPlayers.length} approve, ${rejectingPlayers.length} reject)`;
    } else {
      statusText = `❌ *Team Rejected* (${approvingPlayers.length} approve, ${rejectingPlayers.length} reject)`;
    }

    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${questOrder[proposal.questNumber].charAt(0).toUpperCase() + questOrder[proposal.questNumber].slice(1)} Quest - Vote Result*\n${teamNomination}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: statusText
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Final Votes:*\n${playerStatusList}`
          }
        ]
      }
    ];
  }

  /**
   * Creates blocks for team voting (in progress or complete)
   */
  static createTeamVoteBlocks(
    proposal: TeamProposal,
    allPlayers: Player[],
    viewingPlayer: Player,
    approvingPlayers: Player[],
    rejectingPlayers: Player[],
    questOrder: string[]
  ): any[] {
    const M = require("./message-helpers");
    const teamNomination = `${M.formatAtUser(proposal.leader.id)} is nominating ${M.pp(
      proposal.members,
    )} for the ${questOrder[proposal.questNumber]} quest`;

    const votedCount = approvingPlayers.length + rejectingPlayers.length;
    const totalVotes = allPlayers.length;
    const allVotesIn = votedCount === totalVotes;

    // Create progress bar
    const progressBar = MessageBlockBuilder.createProgressBar(votedCount, totalVotes, 10);

    // Build player status list with icons
    let playerStatusList: string;
    if (allVotesIn) {
      // Show actual votes only after all votes are in
      playerStatusList = allPlayers.map(p => {
        if (approvingPlayers.some(ap => ap.id === p.id)) {
          return `✅ ${M.formatAtUser(p.id)}`;
        } else if (rejectingPlayers.some(rp => rp.id === p.id)) {
          return `❌ ${M.formatAtUser(p.id)}`;
        } else {
          return `⬜ ${M.formatAtUser(p.id)}`;
        }
      }).join('\n');
    } else {
      // Before all votes are in, only show who has voted (not how they voted)
      playerStatusList = allPlayers.map(p => {
        const hasVoted = approvingPlayers.some(ap => ap.id === p.id) ||
                        rejectingPlayers.some(rp => rp.id === p.id);
        if (hasVoted) {
          return `🗳️ ${M.formatAtUser(p.id)}`;
        } else {
          return `⏳ ${M.formatAtUser(p.id)}`;
        }
      }).join('\n');
    }

    // Determine final result or current status
    let statusText = '';
    if (allVotesIn) {
      if (approvingPlayers.length > rejectingPlayers.length) {
        statusText = `✅ *Team Accepted* (${approvingPlayers.length} approve, ${rejectingPlayers.length} reject)`;
      } else {
        statusText = `❌ *Team Rejected* (${approvingPlayers.length} approve, ${rejectingPlayers.length} reject)`;
      }
    } else {
      statusText = `🗳️ *Voting in Progress*\n${progressBar} ${votedCount}/${totalVotes} votes received`;
    }

    const hasVoted = approvingPlayers.some(ap => ap.id === viewingPlayer.id) ||
                     rejectingPlayers.some(rp => rp.id === viewingPlayer.id);

    const blocks: any[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${questOrder[proposal.questNumber].charAt(0).toUpperCase() + questOrder[proposal.questNumber].slice(1)} Quest - Team Vote*\n${teamNomination}\n*Attempt:* ${proposal.attemptNumber}/5`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: statusText
        }
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Player Votes:*\n${playerStatusList}`
          }
        ]
      }
    ];

    // Add action buttons if player hasn't voted yet
    if (!hasVoted && !allVotesIn) {
      blocks.push({
        type: "actions",
        block_id: "quest-team-vote",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✅ Approve",
              emoji: true,
            },
            value: "approve",
            action_id: "approve",
            style: "primary"
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "❌ Reject",
              emoji: true,
            },
            value: "reject",
            action_id: "reject",
            style: "danger"
          },
        ],
      });
    }

    return blocks;
  }

  /**
   * Creates blocks for quest execution (in progress)
   */
  static createQuestExecutionBlocks(
    questPlayers: Player[],
    allPlayers: Player[],
    viewingPlayer: Player,
    leader: Player,
    questNumber: number,
    playerIdsWhoHaveQuested: string[],
    questProgress: string[],
    questOrder: string[],
    questAssignments: QuestAssignment[]
  ): any[] {
    const M = require("./message-helpers");
    
    let order = allPlayers.map((p) =>
      p.id == leader.id ? `*${M.formatAtUser(p.id)}*` : M.formatAtUser(p.id),
    );

    const header_blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${questOrder[questNumber].charAt(0).toUpperCase() + questOrder[questNumber].slice(1)} Quest - In Progress`,
          emoji: true
        }
      },
      ...MessageBlockBuilder.createQuestProgressBlocks(questProgress, questOrder, true, questAssignments, questNumber),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Quest Team:* ${M.pp(questPlayers)}`
        }
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `Player order: ${order.join(', ')}`
        }]
      },
      { type: 'divider' }
    ];

    const summary_blocks = []
    if(questPlayers.length > playerIdsWhoHaveQuested.length) {
      const still_waiting_on = `*Waiting for:* ${M.pp(questPlayers.filter(x => !playerIdsWhoHaveQuested.includes(x.id)))}`

      summary_blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: still_waiting_on
        }
      })
    } else {
      summary_blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: All quest members have submitted their choices!`
        }
      })
    }

    const action_blocks = []
    if(questPlayers.map(x => x.id).includes(viewingPlayer.id) && !playerIdsWhoHaveQuested.includes(viewingPlayer.id)) {

      const action_buttons = [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: ":white_check_mark: Succeed",
            emoji: true,
          },
          value: "succeed",
          action_id: "succeed",
        }
      ]

      // Only baddies can fail missions
      if(!["good", "merlin", "percival"].includes(viewingPlayer.role)) {
        action_buttons.push(
          {
            type: "button",
            text: {
              type: "plain_text",
              text: ":x: Fail",
              emoji: true,
            },
            value: "fail",
            action_id: "fail",
          }
        )
      }

      action_blocks.push(
        {
          type: "actions",
          block_id: "quest-success-vote",
          elements: action_buttons
        }
      )
    }

    return [
      ...header_blocks,
      ...summary_blocks,
      ...action_blocks
    ];
  }
}
