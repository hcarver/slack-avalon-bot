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
import { Player, QuestAssignment, GameConfig, GameScore, QuestResult, Role, TeamProposal, GameState } from "./types";

const M = require("./message-helpers");
require("string_score");

export class Avalon {
  gameState!: GameState; // Initialized in start()
  gameUx: GameUILayer;
  api: webApi.WebClient;
  questManager!: QuestManager; // Initialized in start()
  bolt: any;

  // Temporary storage until start() is called
  private channel: any;
  private playerIds: string[];
  private config: GameConfig; // Added for message listening

  static MIN_PLAYERS = 5;

  static MAX_PLAYERS = 10;

  static DEFAULT_CONFIG: GameConfig = {
    resistance: false,
    order: "turn",
    specialRoles: ["merlin"],
  };

  static ROLES = {
    bad: ":red_circle: Minion of Mordred",
    good: ":large_blue_circle: Loyal Servant of Arthur",
    assassin: ":crossed_swords: THE ASSASSIN :red_circle: Minion of Mordred",
    oberon: ":alien: OBERON :red_circle: Minion of Mordred: Unknown to the other Minions of Mordred",
    morgana:
      ":japanese_ogre: MORGANA :red_circle: Minion of Mordred. You pose as MERLIN",
    mordred: ":smiling_imp: MORDRED :red_circle: Unknown to MERLIN",
    percival: ":cop: PERCIVAL :large_blue_circle: Loyal Servant of Arthur",
    merlin: ":angel: MERLIN :large_blue_circle: Loyal Servant of Arthur",
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
    let assigns: Role[] = Avalon.ROLE_ASSIGNS[numPlayers - Avalon.MIN_PLAYERS].slice(0);
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

  constructor(gameUx: GameUILayer, api: webApi.WebClient, bolt: any, channel: any, players: string[]) {
    this.api = api;
    this.gameUx = gameUx;
    this.bolt = bolt;
    this.channel = channel;
    this.playerIds = players;
    this.config = structuredClone(Avalon.DEFAULT_CONFIG);
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

  start(playerDms: Record<string, string>, timeBetweenRounds?: number): Promise<void> {
    timeBetweenRounds = timeBetweenRounds || 1000;

    const playerObjs = this.playerIds.map((id) => ({ id }));
    let players = this.playerOrder(playerObjs);
    let assigns = this.getRoleAssigns(
      Avalon.getAssigns(players.length, this.config.specialRoles, this.config.resistance),
    );

    let evils = [];
    for (let i = 0; i < players.length; i++) {
      let player = players[i];
      player.role = assigns[i];
      if (
        player.role != "good" &&
        player.role != "merlin" &&
        player.role != "percival"
      ) {
        evils.push(player);
      }
    }

    const assassin = this.config.resistance ? evils[0] : this.getAssassin(evils);

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
      Avalon.QUEST_ASSIGNS[this.gameState.getPlayerCount() - Avalon.MIN_PLAYERS]
    );

    const presentRoles = players.map(p => p.role).filter((r): r is Role => r !== undefined);

    let specialRoles = Object.keys(Avalon.ROLES)
    .filter((role): role is Role => presentRoles.indexOf(role as Role) >= 0)
    .map((role) => {
      switch (role) {
        case "merlin":
          return ":angel: MERLIN";
        case "percival":
          return ":cop: PERCIVAL";
        case "morgana":
          return ":japanese_ogre: MORGANA";
        case "mordred":
          return ":smiling_imp: MORDRED";
        case "oberon":
          return ":alien: OBERON";
      }
    })
    .filter((role) => !!role)
    .join(", ");

    const all_player_blocks = [
      {type: "markdown", text: `${this.gameState.getEvilCount()} out of ${this.gameState.getPlayerCount()} players are evil.`},
      {type: "markdown", text: `Special roles: ${specialRoles}`}
    ];

    let knownEvils = evils.filter((player) => player.role != "oberon");
    for (let player of this.gameState.players) {
      const roleBlocks = MessageBlockBuilder.createRoleInfoBlocks(
        player,
        players,
        evils,
        knownEvils,
        this.gameState.assassin.id,
        this.gameState.getEvilCount(),
        this.gameState.getPlayerCount()
      );

      this.api.chat.postMessage({
        channel: this.gameState.playerDms[player.id],
        blocks: roleBlocks,
        text: `You are ${Avalon.ROLES[player.role]}`
      });
    }

    (async () => {
      while (!this.gameState.isGameEnded()) {
        await this.playRound();
      }
    })();
    return Promise.resolve();
  }

  getRoleAssigns(roles: Role[]): Role[] {
    return _.shuffle(roles);
  }

  playerOrder(players: Player[]): Player[] {
    return _.shuffle(players);
  }

  getAssassin(evils: Player[]): Player {
    let assassinArray = evils.filter((player) => player.role == "assassin");
    if (assassinArray.length) {
      return assassinArray[0];
    } else {
      return _.shuffle(evils)[0];
    }
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
    const blocks = MessageBlockBuilder.createEndGameBlocks(message, this.gameState.players, this.questManager.getProgress(), Avalon.ORDER);

    this.gameState.players.forEach(p => {
      this.api.chat.postMessage({
        channel: this.gameState.playerDms[p.id],
        blocks: blocks,
        text: message
      });
    });

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
      Avalon.ORDER[this.questManager.getCurrentQuestNumber()]
    } quest.`;

    let order = this.gameState.players.map((p) =>
      p.id == player.id
        ? `*${M.formatAtUser(p.id)}*`
        : M.formatAtUser(p.id),
    );

    const statusBlocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${Avalon.ORDER[this.questManager.getCurrentQuestNumber()].charAt(0).toUpperCase() + Avalon.ORDER[this.questManager.getCurrentQuestNumber()].slice(1)} Quest - Team Selection`,
          emoji: true
        }
      },
      ...MessageBlockBuilder.createQuestProgressBlocks(this.questManager.getProgress(), Avalon.ORDER, true, this.questManager.getAllQuestAssignments(), this.questManager.getCurrentQuestNumber()),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${M.formatAtUser(player.id)}* will choose${message}\n*Attempt:* ${this.gameState.rejectCount + 1}/5`
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

    this.gameState.players.forEach(p => {
      this.api.chat.postMessage({
        channel: this.gameState.playerDms[p.id],
        blocks: statusBlocks,
        text: `${M.formatAtUser(player.id)} will choose${message} (attempt number ${this.gameState.rejectCount + 1})`
      });
    });

    const successful = await this.choosePlayersForQuest(player);
    if (successful) {
      this.gameState.resetRejectCount();
      await new Promise(resolve => setTimeout(resolve, timeToPause));
      return await this.runQuest(this.gameState.questPlayers, player);
    }
    this.gameState.incrementRejectCount();

    return true;
  }

  async choosePlayersForQuest(player: Player): Promise<boolean> {
    let questAssign = this.questManager.getCurrentQuestAssignment();

    // Await the player's team choice
    const playerChoice = this.gameUx.pollForDecision(
      this.gameState.playerDms[player.id],
      `Choose a team of ${questAssign.n}`,
      this.gameState.players.map((player) => M.formatAtUser(player)),
      "Nominate",
      (user_id) => user_id === player.id,
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

    // Auto-accept teams on the 5th attempt
    if(proposal.isLastAttempt()) {
      return true;
    }

    // Vote on the team
    const teamVotingService = new TeamVotingService(this.api, this.bolt);
    return await teamVotingService.voteOnTeam(
      proposal,
      this.gameState.players,
      this.gameState.playerDms,
      Avalon.ORDER
    );
  }

  getStatus(current: boolean): string {
    let status = this.questManager.getProgress().map((res, i) => {
      let questAssign =
        Avalon.QUEST_ASSIGNS[this.gameState.players.length - Avalon.MIN_PLAYERS][i];
      let circle = res == "good" ? ":large_blue_circle:" : ":red_circle:";
      return `${questAssign.n}${questAssign.f > 1 ? "*" : ""}${circle}`;
    });
    if (current) {
      let questAssign =
        Avalon.QUEST_ASSIGNS[this.gameState.players.length - Avalon.MIN_PLAYERS][
          this.questManager.getCurrentQuestNumber()
        ];
      status.push(
        `${questAssign.n}${questAssign.f > 1 ? "*" : ""}:black_circle:`,
      );
    }
    if (status.length < Avalon.ORDER.length) {
      status = status.concat(
        _.times(Avalon.ORDER.length - status.length, (i) => {
          let questAssign =
            Avalon.QUEST_ASSIGNS[this.gameState.players.length - Avalon.MIN_PLAYERS][
              i + status.length
            ];
          return `${questAssign.n}${
            questAssign.f > 1 ? "*" : ""
          }:white_circle:`;
        }),
      );
    }
    return status.join(",");
  }


  async runQuest(questPlayers: Player[], leader: Player): Promise<boolean> {
    const questExecutionService = new QuestExecutionService(this.api, this.bolt);
    
    const { failed, succeeded } = await questExecutionService.executeQuest(
      questPlayers,
      this.gameState.players,
      leader,
      this.questManager.getCurrentQuestNumber(),
      this.questManager.getProgress(),
      this.gameState.playerDms,
      Avalon.ORDER,
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
    const questName = Avalon.ORDER[questNumber].charAt(0).toUpperCase() + Avalon.ORDER[questNumber].slice(1);
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
    blocks.push(...MessageBlockBuilder.createQuestProgressBlocks(this.questManager.getProgress(), Avalon.ORDER, false));

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

    // Send to all players and wait for all messages to be sent
    await Promise.all(this.gameState.players.map(p => {
      return this.api.chat.postMessage({
        channel: this.gameState.playerDms[p.id],
        blocks: blocks,
        text: `${questName} Quest ${resultText}`
      });
    }));
  }

  async evaluateEndGame(score: GameScore): Promise<void> {
    if (score.bad == 3) {
      this.endGame(
        `:red_circle: Minions of Mordred win by failing 3 quests!`,
        "#e00",
        false
      );
      return;
    } else if (score.good == 3) {
      let merlinArray = this.gameState.players.filter((player) => player.role == "merlin");
      if (!merlinArray.length) {
        this.endGame(
          `:large_blue_circle: Loyal Servants of Arthur win by succeeding 3 quests!`,
          "#08e",
          false
        );
        return;
      }
      let assassin = this.gameState.assassin;
      let merlin = merlinArray[0];
      const killablePlayers = this.gameState.players.filter((p) => p.role && RoleManager.isGoodPlayer(p.role));
      await this.assassinMerlinKill(assassin, merlin, killablePlayers);
    }
  }

  async assassinMerlinKill(assassin: Player, merlin: Player, killablePlayers: Player[]): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Broadcast assassination phase announcement
    const announcementBlocks = MessageBlockBuilder.createAssassinationAnnouncementBlocks(assassin.id);

    this.gameState.players.forEach(p => {
      this.api.chat.postMessage({
        channel: this.gameState.playerDms[p.id],
        blocks: announcementBlocks,
        text: `${M.formatAtUser(assassin.id)} is the ASSASSIN. They can now try to kill MERLIN.`
      });
    });

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
      this.gameState.playerDms[assassin.id],
      `Choose who to assassinate`,
      killablePlayers.map((player) => M.formatAtUser(player)),
      "⚔️ Assassinate",
      (user_id) => user_id === assassin.id,
      1,
      1,
    );
    const idx = await playerChoice;
    const accused = killablePlayers[idx[0]];

    // Result announcement
    const resultBlocks = MessageBlockBuilder.createAssassinationResultBlocks(
      assassin.id,
      accused.id,
      merlin.id,
      accused.role === "merlin",
      this.gameState.players,
      this.questManager.getProgress(),
      Avalon.ORDER,
      this.questManager.getAllQuestAssignments()
    );
    this.gameState.players.forEach(p => {
      this.api.chat.postMessage({
        channel: this.gameState.playerDms[p.id],
        blocks: resultBlocks,
        text: accused.role === "merlin" ? "Evil wins! Assassin killed Merlin!" : "Good wins! Assassin missed!"
      });
    });

    this.quit();
  }
}

module.exports = Avalon;
