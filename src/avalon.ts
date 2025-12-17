"use strict";

import { webApi } from "@slack/bolt";
import * as _ from "lodash";

import { GameUILayer } from "./game-ui-layer";
import { RoleManager } from "./role-manager";
import { MessageBlockBuilder } from "./message-block-builder";
import { QuestManager } from "./quest-manager";
import { ActionCollector } from "./services/ActionCollector";
import { TeamVotingService } from "./services/TeamVotingService";
import { QuestExecutionService } from "./services/QuestExecutionService";
import { GameMessenger } from "./services/GameMessenger";
import { RoleService } from "./services/RoleService";
import { SlackMessageService } from "./infrastructure/SlackMessageService";
import { SlackActionListenerService } from "./infrastructure/SlackActionListenerService";
import { IMessageService, IActionListenerService } from "./interfaces";
import { GameConfiguration } from "./domain/GameConfiguration";
import { GamePhase } from "./domain/GamePhaseManager";
import { GameConstants } from "./constants/GameConstants";
import { Player, QuestAssignment, GameConfig, GameScore, QuestResult, Role, TeamProposal, GameState } from "./types";
import { UserId, DmChannelId } from "./slack-api-rx";

const M = require("./message-helpers");
require("string_score");

export class Avalon {
  gameState!: GameState; // Initialized in start()
  gameUx: GameUILayer;
  api: webApi.WebClient;
  questManager!: QuestManager; // Initialized in start()
  bolt: any;
  messenger!: GameMessenger; // Initialized in start()
  gameConfig!: GameConfiguration; // Initialized in start()
  
  // Services
  private messageService: IMessageService;
  private actionService: IActionListenerService;

  // Temporary storage until start() is called
  private channel: any;
  private playerIds: UserId[];
  private config: GameConfig; // Added for message listening

  static MIN_PLAYERS = 5;

  static MAX_PLAYERS = 10;

  static DEFAULT_CONFIG: GameConfig = {
    resistance: false,
    order: "turn",
    specialRoles: ["merlin"],
  };

  static ROLE_ASSIGNS: Role[][] = [
    ["bad", "bad", "good", "good", "good"],
    ["bad", "bad", "good", "good", "good", "good"],
    ["bad", "bad", "bad", "good", "good", "good", "good"],
    ["bad", "bad", "bad", "good", "good", "good", "good", "good"],
    ["bad", "bad", "bad", "good", "good", "good", "good", "good", "good"],
    [
      "bad",
      "bad",
      "bad",
      "bad",
      "good",
      "good",
      "good",
      "good",
      "good",
      "good",
    ],
  ];

  static ORDER = ["first", "second", "third", "fourth", "last"];

  static QUEST_ASSIGNS: QuestAssignment[][] = [
    [
      { n: 2, f: 1 },
      { n: 3, f: 1 },
      { n: 2, f: 1 },
      { n: 3, f: 1 },
      { n: 3, f: 1 },
    ],
    [
      { n: 2, f: 1 },
      { n: 3, f: 1 },
      { n: 3, f: 1 },
      { n: 3, f: 1 },
      { n: 4, f: 1 },
    ],
    [
      { n: 2, f: 1 },
      { n: 3, f: 1 },
      { n: 3, f: 1 },
      { n: 4, f: 2 },
      { n: 4, f: 1 },
    ],
    [
      { n: 3, f: 1 },
      { n: 4, f: 1 },
      { n: 4, f: 1 },
      { n: 5, f: 2 },
      { n: 5, f: 1 },
    ],
    [
      { n: 3, f: 1 },
      { n: 4, f: 1 },
      { n: 4, f: 1 },
      { n: 5, f: 2 },
      { n: 5, f: 1 },
    ],
    [
      { n: 3, f: 1 },
      { n: 4, f: 1 },
      { n: 4, f: 1 },
      { n: 5, f: 2 },
      { n: 5, f: 1 },
    ],
  ];

  static getAssigns(numPlayers: number, specialRoles: Role[], resistance: boolean): Role[] {
    resistance = resistance || false;
    let assigns: Role[] = Avalon.ROLE_ASSIGNS[numPlayers - GameConfiguration.MIN_PLAYERS].slice(0);
    if (!resistance) {
      specialRoles.forEach((role) => {
        switch (role) {
          case "merlin":
          case "percival":
            assigns[assigns.indexOf("good")] = role;
            break;
          default:
            assigns[assigns.indexOf("bad")] = role;
        }
      });
      let badIndex = assigns.indexOf("bad");
      if (badIndex >= 0) {
        assigns[badIndex] = "assassin";
      }
    }
    return assigns;
  }

  constructor(gameUx: GameUILayer, api: webApi.WebClient, bolt: any, channel: any, players: UserId[]) {
    this.api = api;
    this.gameUx = gameUx;
    this.bolt = bolt;
    this.channel = channel;
    this.playerIds = players;
    this.config = structuredClone(Avalon.DEFAULT_CONFIG);
    
    // Initialize services
    this.messageService = new SlackMessageService(api);
    this.actionService = new SlackActionListenerService(bolt);
  }

  configure(config: Partial<GameConfig>): void {
    if (config.resistance !== undefined) {
      this.config.resistance = config.resistance;
    }
    if (config.specialRoles) {
      this.config.specialRoles = [...config.specialRoles];
    }
    if (config.order) {
      this.config.order = config.order;
    }
  }

  async start(userDms: Record<string, DmChannelId>, timeBetweenRounds?: number): Promise<void> {
    timeBetweenRounds = timeBetweenRounds || 1000;

    // Create game configuration
    this.gameConfig = new GameConfiguration(
      this.playerIds.length,
      this.config.specialRoles as Role[],
      this.config.resistance,
      this.config.order as 'turn' | 'random'
    );

    const playerObjs = Player.fromUserIds(this.playerIds);
    let players = this.playerOrder(playerObjs);

    // Build playerDms mapping: playerId -> dmChannelId
    const playerDms: Record<string, string> = {};
    playerObjs.forEach(p => {
      playerDms[p.playerId] = userDms[p.userId];
    });

    // Use RoleService to assign roles
    const roleService = new RoleService(this.gameConfig);
    const { evils, assassin } = roleService.assignRoles(players);

    // Create GameState once with all proper values
    this.gameState = new GameState(
      players,
      playerDms,
      this.channel,
      this.config.resistance,
      this.config.specialRoles,
      evils,
      assassin
    );

    this.questManager = new QuestManager(
      this.gameConfig.getQuestAssignments()
    );

    // Initialize messenger with playerDms
    this.messenger = new GameMessenger(this.messageService, playerDms);

    const presentRoles = players.map(p => p.role).filter((r): r is Role => r !== undefined);

    let specialRoles = presentRoles
    .filter((role): role is Role => ['merlin', 'percival', 'morgana', 'mordred', 'oberon'].includes(role))
    .map((role) => GameConstants.getRoleShortName(role).toUpperCase())
    .join(", ");

    const all_player_blocks = [
      {type: "markdown", text: `${this.gameState.getEvilCount()} out of ${this.gameState.getPlayerCount()} players are evil.`},
      {type: "markdown", text: `Special roles: ${specialRoles}`}
    ];

    let knownEvils = evils.filter((player) => player.role != "oberon");
    
    // Transition to role assignment phase
    this.gameState.transitionToPhase(GamePhase.ROLE_ASSIGNMENT);
    
    // Send role information to all players
    await this.messenger.broadcastToAll(
      this.gameState.players,
      (player) => MessageBlockBuilder.createRoleInfoBlocks(
        player,
        players,
        evils,
        knownEvils,
        this.gameState.assassin.playerId,
        this.gameState.getEvilCount(),
        this.gameState.getPlayerCount()
      ),
      (player) => `You are ${GameConstants.getRoleName(player.role!)}`
    );

    // Transition to team selection phase
    this.gameState.transitionToPhase(GamePhase.TEAM_SELECTION);

    (async () => {
      while (!this.gameState.isGameEnded()) {
        await this.playRound();
      }
    })();
    return Promise.resolve();
  }

  playerOrder(players: Player[]): Player[] {
    return _.shuffle(players);
  }

  quit() {
    this.gameState.endGame();
  }

  async playRound() {
    const leader = this.gameState.getCurrentLeader();
    await this.deferredActionForPlayer(leader);
    this.gameState.advanceLeader();
  }

  endGame(message: string, color: string, current: boolean): void {
    const blocks = MessageBlockBuilder.createEndGameBlocks(message, this.gameState.players, this.questManager.getProgress(), GameConfiguration.QUEST_NAMES);

    this.messenger.broadcastSame(
      this.gameState.players,
      blocks,
      message
    );

    this.quit();
  }

  async deferredActionForPlayer(player: Player, timeToPause?: number): Promise<boolean> {
    timeToPause = timeToPause || 3000;
    await new Promise(resolve => setTimeout(resolve, timeToPause));

    const questAssign = this.questManager.getCurrentQuestAssignment();
    let f = "";
    if (questAssign.f > 1) {
      f = "(2 fails required) ";
    }
    let message = ` ${questAssign.n} players ${f}to go on the ${
      GameConfiguration.QUEST_NAMES[this.questManager.getCurrentQuestNumber()]
    } quest.`;

    let order = this.gameState.players.map((p) =>
      p.playerId == player.playerId
        ? `*${M.formatAtUser(p)}*`
        : M.formatAtUser(p),
    );

    const statusBlocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${GameConfiguration.QUEST_NAMES[this.questManager.getCurrentQuestNumber()].charAt(0).toUpperCase() + GameConfiguration.QUEST_NAMES[this.questManager.getCurrentQuestNumber()].slice(1)} Quest - Team Selection`,
          emoji: true
        }
      },
      ...MessageBlockBuilder.createQuestProgressBlocks(this.questManager.getProgress(), GameConfiguration.QUEST_NAMES, true, this.questManager.getAllQuestAssignments(), this.questManager.getCurrentQuestNumber()),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${M.formatAtUser(player)}* will choose${message}\n*Attempt:* ${this.gameState.rejectCount + 1}/5`
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

    await this.messenger.broadcastSame(
      this.gameState.players,
      statusBlocks,
      `${M.formatAtUser(player)} will choose${message} (attempt number ${this.gameState.rejectCount + 1})`
    );

    const successful = await this.choosePlayersForQuest(player);
    if (successful) {
      this.gameState.resetRejectCount();
      // Transition to quest execution
      this.gameState.transitionToPhase(GamePhase.QUEST_EXECUTION);
      await new Promise(resolve => setTimeout(resolve, timeToPause));
      const result = await this.runQuest(this.gameState.questPlayers, player);
      // Transition back to team selection for next round
      if (!this.gameState.isGameEnded()) {
        this.gameState.transitionToPhase(GamePhase.TEAM_SELECTION);
      }
      return result;
    }
    this.gameState.incrementRejectCount();
    
    // Check for 5 rejections (auto-fail)
    if (this.gameState.rejectCount >= 5) {
      this.gameState.transitionToPhase(GamePhase.GAME_ENDED);
    } else {
      // Stay in team selection phase
      this.gameState.transitionToPhase(GamePhase.TEAM_SELECTION);
    }

    return true;
  }

  async choosePlayersForQuest(player: Player): Promise<boolean> {
    let questAssign = this.questManager.getCurrentQuestAssignment();

    // Await the player's team choice
    const playerChoice = this.gameUx.pollForDecision(
      this.gameState.playerDms[player.playerId],
      `Choose a team of ${questAssign.n}`,
      this.gameState.players.map((player) => M.formatAtUser(player)),
      "Nominate",
      (user_id) => user_id === player.userId,
      questAssign.n,
      questAssign.n,
    );
    const idxs = await playerChoice as number[];
    const questPlayers = idxs.map((i) => this.gameState.players[i]);

    // Create TeamProposal value object
    const proposal = new TeamProposal(
      player,
      questPlayers,
      this.questManager.getCurrentQuestNumber(),
      this.gameState.rejectCount + 1
    );

    this.gameState.setQuestPlayers(questPlayers);

    // Transition to team voting phase
    this.gameState.transitionToPhase(GamePhase.TEAM_VOTING);

    // Auto-accept teams on the 5th attempt
    if(proposal.isLastAttempt()) {
      // Record auto-accepted proposal
      this.gameState.addProposalToHistory({
        questNumber: proposal.questNumber,
        attemptNumber: proposal.attemptNumber,
        leader: proposal.leader,
        members: proposal.members,
        approved: true,
        approveVotes: this.gameState.players,
        rejectVotes: []
      });
      return true;
    }

    // Vote on the team
    const teamVotingService = new TeamVotingService(this.api, this.actionService);
    const voteResult = await teamVotingService.voteOnTeam(
      proposal,
      this.gameState.players,
      this.gameState.playerDms,
      GameConfiguration.QUEST_NAMES
    );

    // Record proposal in history
    this.gameState.addProposalToHistory({
      questNumber: proposal.questNumber,
      attemptNumber: proposal.attemptNumber,
      leader: proposal.leader,
      members: proposal.members,
      approved: voteResult.approved,
      approveVotes: voteResult.approveVotes,
      rejectVotes: voteResult.rejectVotes
    });

    return voteResult.approved;
  }

  getStatus(current: boolean): string {
    const questAssignments = this.gameConfig.getQuestAssignments();
    
    let status = this.questManager.getProgress().map((res, i) => {
      let questAssign = questAssignments[i];
      let circle = res == "good" ? ":large_blue_circle:" : ":red_circle:";
      return `${questAssign.n}${questAssign.f > 1 ? "*" : ""}${circle}`;
    });
    
    if (current) {
      let questAssign = questAssignments[this.questManager.getCurrentQuestNumber()];
      status.push(
        `${questAssign.n}${questAssign.f > 1 ? "*" : ""}:black_circle:`,
      );
    }
    
    if (status.length < GameConfiguration.QUEST_NAMES.length) {
      status = status.concat(
        _.times(GameConfiguration.QUEST_NAMES.length - status.length, (i) => {
          let questAssign = questAssignments[i + status.length];
          return `${questAssign.n}${
            questAssign.f > 1 ? "*" : ""
          }:white_circle:`;
        }),
      );
    }
    return status.join(",");
  }


  async runQuest(questPlayers: Player[], leader: Player): Promise<boolean> {
    const questExecutionService = new QuestExecutionService(this.api, this.actionService);
    
    const { failed, succeeded } = await questExecutionService.executeQuest(
      questPlayers,
      this.gameState.players,
      leader,
      this.questManager.getCurrentQuestNumber(),
      this.questManager.getProgress(),
      this.gameState.playerDms,
      GameConfiguration.QUEST_NAMES,
      this.questManager.getAllQuestAssignments()
    );

    // Evaluate quest result and record it
    let questAssign = this.questManager.getCurrentQuestAssignment();
    const currentQuestNumber = this.questManager.getCurrentQuestNumber();
    
    if (failed.length > 0) {
      if (failed.length < questAssign.f) {
        this.questManager.recordQuestResult("good");
        await this.broadcastQuestResult(questPlayers, "success", failed.length, 0, currentQuestNumber);
      } else {
        this.questManager.recordQuestResult("bad");
        await this.broadcastQuestResult(questPlayers, "failure", failed.length, questAssign.f, currentQuestNumber);
      }
    } else {
      this.questManager.recordQuestResult("good");
      await this.broadcastQuestResult(questPlayers, "success", 0, 0, currentQuestNumber);
    }
    
    await this.evaluateEndGame(this.questManager.calculateScore());
    return true;
  }

  async broadcastQuestResult(questPlayers: Player[], result: "success" | "failure", failCount: number, failsRequired: number, questNumber: number): Promise<void> {
    const blocks: any[] = [];

    // Header
    const questName = GameConfiguration.QUEST_NAMES[questNumber].charAt(0).toUpperCase() + GameConfiguration.QUEST_NAMES[questNumber].slice(1);
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
    blocks.push(...MessageBlockBuilder.createQuestProgressBlocks(this.questManager.getProgress(), GameConfiguration.QUEST_NAMES, false));

    // Score update
    let score = { good: 0, bad: 0 };
    for (let res of this.questManager.getProgress()) {
      score[res]++;
    }

    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Current Score: ${score.good} quest${score.good !== 1 ? 's' : ''} succeeded, ${score.bad} quest${score.bad !== 1 ? 's' : ''} failed`
      }]
    });

    // Send to all players
    await this.messenger.broadcastSame(
      this.gameState.players,
      blocks,
      `${questName} Quest ${resultText}`
    );
  }

  async evaluateEndGame(score: GameScore): Promise<void> {
    if (score.bad == GameConstants.LIMITS.questsToWin) {
      this.gameState.transitionToPhase(GamePhase.GAME_ENDED);
      this.endGame(
        GameConstants.WIN_MESSAGES.evilQuestWin,
        GameConstants.COLORS.evil,
        false
      );
      return;
    } else if (score.good == GameConstants.LIMITS.questsToWin) {
      let merlinArray = this.gameState.players.filter((player) => player.role == "merlin");
      if (!merlinArray.length) {
        this.gameState.transitionToPhase(GamePhase.GAME_ENDED);
        this.endGame(
          GameConstants.WIN_MESSAGES.goodQuestWin,
          GameConstants.COLORS.good,
          false
        );
        return;
      }
      let assassin = this.gameState.assassin;
      let merlin = merlinArray[0];
      const killablePlayers = this.gameState.players.filter((p) => p.role && RoleManager.isGoodPlayer(p.role));
      
      // Transition to assassination phase
      this.gameState.transitionToPhase(GamePhase.ASSASSINATION);
      await this.assassinMerlinKill(assassin, merlin, killablePlayers);
    }
  }

  async assassinMerlinKill(assassin: Player, merlin: Player, killablePlayers: Player[]): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, GameConstants.TIMING.beforeAssassination));

    // Broadcast assassination phase announcement
    const announcementBlocks = MessageBlockBuilder.createAssassinationAnnouncementBlocks(assassin.userId);

    await this.messenger.broadcastSame(
      this.gameState.players,
      announcementBlocks,
      `${M.formatAtUser(assassin)} is the ASSASSIN. They can now try to kill MERLIN.`
    );

    // Assassin's choice interface
    const assassinBlocks: any[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚔️ Choose Your Target',
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `You are the Assassin! 🔴 Evil's fate is in your hands.\n\nGood has won 3 quests, but you can still win by correctly identifying and killing MERLIN.\n\n*Choose wisely...*`
        }
      }
    ];

    const playerChoice = this.gameUx.pollForDecision(
      this.gameState.playerDms[assassin.playerId],
      `Choose who to assassinate`,
      killablePlayers.map((player) => M.formatAtUser(player)),
      "⚔️ Assassinate",
      (user_id) => user_id === assassin.userId,
      1,
      1,
    );
    const idx = await playerChoice;
    const accused = killablePlayers[idx[0]];

    // Result announcement
    const resultBlocks = MessageBlockBuilder.createAssassinationResultBlocks(
      assassin.userId,
      accused.userId,
      merlin.userId,
      accused.role === "merlin",
      this.gameState.players,
      this.questManager.getProgress(),
      GameConfiguration.QUEST_NAMES,
      this.questManager.getAllQuestAssignments()
    );
    
    // Transition to game ended
    this.gameState.transitionToPhase(GamePhase.GAME_ENDED);
    
    const winMessage = accused.role === "merlin" 
      ? GameConstants.WIN_MESSAGES.evilAssassinWin 
      : GameConstants.WIN_MESSAGES.goodAssassinWin;
    
    await this.messenger.broadcastSame(
      this.gameState.players,
      resultBlocks,
      winMessage
    );

    this.quit();
  }
}

module.exports = Avalon;
