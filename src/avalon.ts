"use strict";

import { webApi } from "@slack/bolt";
import * as _ from "lodash";

import { GameUILayer } from "./game-ui-layer";
import { RoleManager } from "./role-manager";
import { MessageBlockBuilder } from "./message-block-builder";
import { QuestManager } from "./quest-manager";
import { Player, QuestAssignment, GameConfig, GameScore, QuestResult, Role, TeamProposal } from "./types";

const M = require("./message-helpers");
require("string_score");

export class Avalon {
  players: Player[];
  playerDms: Record<string, string>;
  gameUx: GameUILayer;
  api: webApi.WebClient;
  date: Date;
  channel: any;
  isRunning: boolean;
  questManager: QuestManager;
  rejectCount: number;
  specialRoles: Role[];
  evils: Player[];
  assassin: Player;
  resistance: boolean;
  questPlayers: Player[];
  bolt: any; // Added for message listening
  private _gameEnded: boolean = false;
  private currentLeaderIndex: number;

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
    this.players = players.map((id) => ({ id }));
    Object.assign(this, Avalon.DEFAULT_CONFIG);
    this._gameEnded = false;
  }

  start(playerDms: Record<string, string>, timeBetweenRounds?: number): Promise<void> {
    timeBetweenRounds = timeBetweenRounds || 1000;
    this.isRunning = true;
    this.questManager = new QuestManager(
      this.players.length,
      this.players.length - Avalon.MIN_PLAYERS,
      Avalon.QUEST_ASSIGNS
    );
    this.rejectCount = 0;
    this.playerDms = playerDms;
    this.date = new Date();
    this.currentLeaderIndex = 0;

    let players = (this.players = this.playerOrder(this.players));
    let assigns = this.getRoleAssigns(
      Avalon.getAssigns(players.length, this.specialRoles, this.resistance),
    );

    let evils = (this.evils = []);
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

    if (!this.resistance) {
      this.assassin = this.getAssassin();
    }

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
      {type: "markdown", text: `${this.evils.length} out of ${this.players.length} players are evil.`},
      {type: "markdown", text: `Special roles: ${specialRoles}`}
    ];

    let knownEvils = evils.filter((player) => player.role != "oberon");
    for (let player of this.players) {
      const roleBlocks = MessageBlockBuilder.createRoleInfoBlocks(
        player,
        players,
        evils,
        knownEvils,
        this.assassin.id,
        this.evils.length,
        this.players.length
      );

      this.api.chat.postMessage({
        channel: this.playerDms[player.id],
        blocks: roleBlocks,
        text: `You are ${Avalon.ROLES[player.role]}`
      });
    }

    this._gameEnded = false;
    (async () => {
      while (!this._gameEnded) {
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

  getAssassin(): Player {
    let assassinArray = this.evils.filter((player) => player.role == "assassin");
    if (assassinArray.length) {
      return assassinArray[0];
    } else {
      return _.shuffle(this.evils)[0];
    }
  }

  quit() {
    this._gameEnded = true;
    this.isRunning = false;
  }

  async playRound() {
    const leader = this.players[this.currentLeaderIndex];
    await this.deferredActionForPlayer(leader);
    this.currentLeaderIndex = (this.currentLeaderIndex + 1) % this.players.length;
  }

  endGame(message: string, color: string, current: boolean): void {
    const blocks = MessageBlockBuilder.createEndGameBlocks(message, this.players, this.questManager.getProgress(), Avalon.ORDER);

    this.players.forEach(p => {
      this.api.chat.postMessage({
        channel: this.playerDms[p.id],
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

    let order = this.players.map((p) =>
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
      ...MessageBlockBuilder.createQuestProgressBlocks(this.questManager.getProgress(), Avalon.ORDER, true, Avalon.QUEST_ASSIGNS, this.players.length - Avalon.MIN_PLAYERS, this.questManager.getCurrentQuestNumber()),
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${M.formatAtUser(player.id)}* will choose${message}\n*Attempt:* ${this.rejectCount + 1}/5`
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

    this.players.forEach(p => {
      this.api.chat.postMessage({
        channel: this.playerDms[p.id],
        blocks: statusBlocks,
        text: `${M.formatAtUser(player.id)} will choose${message} (attempt number ${this.rejectCount + 1})`
      });
    });

    const successful = await this.choosePlayersForQuest(player);
    if (successful) {
      this.rejectCount = 0;
      await new Promise(resolve => setTimeout(resolve, timeToPause));
      return await this.runQuest(this.questPlayers, player);
    }
    this.rejectCount++;

    return true;
  }

  questHistoryMessage(proposal: TeamProposal, to_player, approving_players=[], rejecting_players=[]) {
    const teamNomination = `${M.formatAtUser(proposal.leader.id)} nominated ${M.pp(
      proposal.members,
    )} for the ${Avalon.ORDER[proposal.questNumber]} quest`;

    const votedCount = approving_players.length + rejecting_players.length;
    const totalVotes = this.players.length;

    // Build player status list with icons
    const playerStatusList = this.players.map(p => {
      if (approving_players.some(ap => ap.id === p.id)) {
        return `✅ ${M.formatAtUser(p.id)}`;
      } else if (rejecting_players.some(rp => rp.id === p.id)) {
        return `❌ ${M.formatAtUser(p.id)}`;
      } else {
        return `⬜ ${M.formatAtUser(p.id)}`;
      }
    }).join('\n');

    // Determine final result
    let statusText = '';
    if (approving_players.length > rejecting_players.length) {
      statusText = `✅ *Team Accepted* (${approving_players.length} approve, ${rejecting_players.length} reject)`;
    } else {
      statusText = `❌ *Team Rejected* (${approving_players.length} approve, ${rejecting_players.length} reject)`;
    }

    return {
      channel: this.playerDms[to_player.id],
      text: `${teamNomination} - ${statusText}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${Avalon.ORDER[proposal.questNumber].charAt(0).toUpperCase() + Avalon.ORDER[proposal.questNumber].slice(1)} Quest - Vote Result*\n${teamNomination}`
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
      ]
    }
  }

  voteForQuestMessage(proposal: TeamProposal, to_player, approving_players=[], rejecting_players=[]) {
    const teamNomination = `${M.formatAtUser(proposal.leader.id)} is nominating ${M.pp(
      proposal.members,
    )} for the ${Avalon.ORDER[proposal.questNumber]} quest`;

    const votedCount = approving_players.length + rejecting_players.length;
    const totalVotes = this.players.length;
    const allVotesIn = votedCount === totalVotes;

    // Create progress bar
    const progressBar = MessageBlockBuilder.createProgressBar(votedCount, totalVotes, 10);

    // Build player status list with icons
    let playerStatusList: string;
    if (allVotesIn) {
      // Show actual votes only after all votes are in
      playerStatusList = this.players.map(p => {
        if (approving_players.some(ap => ap.id === p.id)) {
          return `✅ ${M.formatAtUser(p.id)}`;
        } else if (rejecting_players.some(rp => rp.id === p.id)) {
          return `❌ ${M.formatAtUser(p.id)}`;
        } else {
          return `⬜ ${M.formatAtUser(p.id)}`;
        }
      }).join('\n');
    } else {
      // Before all votes are in, only show who has voted (not how they voted)
      playerStatusList = this.players.map(p => {
        const hasVoted = approving_players.some(ap => ap.id === p.id) ||
                        rejecting_players.some(rp => rp.id === p.id);
        if (hasVoted) {
          return `🗳️ ${M.formatAtUser(p.id)}`;
        } else {
          return `⏳ ${M.formatAtUser(p.id)}`;
        }
      }).join('\n');
    }


    // Determine final result or current status
    let statusText = '';
    let statusColor = '';

    if (allVotesIn) {
      if (approving_players.length > rejecting_players.length) {
        statusText = `✅ *Team Accepted* (${approving_players.length} approve, ${rejecting_players.length} reject)`;
        statusColor = 'good';
      } else {
        statusText = `❌ *Team Rejected* (${approving_players.length} approve, ${rejecting_players.length} reject)`;
        statusColor = 'danger';
      }
    } else {
      statusText = `🗳️ *Voting in Progress*\n${progressBar} ${votedCount}/${totalVotes} votes received`;
    }

    const hasVoted = approving_players.some(ap => ap.id === to_player.id) ||
                     rejecting_players.some(rp => rp.id === to_player.id);

    const blocks: any[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${Avalon.ORDER[proposal.questNumber].charAt(0).toUpperCase() + Avalon.ORDER[proposal.questNumber].slice(1)} Quest - Team Vote*\n${teamNomination}\n*Attempt:* ${proposal.attemptNumber}/5`
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

    return {
      channel: this.playerDms[to_player.id],
      text: `${teamNomination} - ${statusText}`,
      blocks: blocks
    };
  }

  async choosePlayersForQuest(player: Player): Promise<boolean> {
    let questAssign = this.questManager.getCurrentQuestAssignment();

    // Await the player's team choice
    const playerChoice = this.gameUx.pollForDecision(
      this.playerDms[player.id],
      `Choose a team of ${questAssign.n}`,
      this.players.map((player) => M.formatAtUser(player)),
      "Nominate",
      (user_id) => user_id === player.id,
      questAssign.n,
      questAssign.n,
    );
    const idxs = await playerChoice as number[];
    const questPlayers = idxs.map((i) => this.players[i]);
    
    // Create TeamProposal value object
    const proposal = new TeamProposal(
      player,
      questPlayers,
      this.questManager.getCurrentQuestNumber(),
      this.rejectCount + 1
    );
    
    this.questPlayers = questPlayers;

    // Auto-accept teams on the 5th attempt
    if(proposal.isLastAttempt()) {
      return true;
    }

    // Send voting messages to all players and collect their message timestamps
    // List of player ids and timestamps
    // This is necessary, rather than a map, because we use the same player id multiple times in dev
    const player_messages: Array<[{id: string}, string]> = [];
    await Promise.all(this.players.map(async (p) => {
      const resp = await this.api.chat.postMessage(this.voteForQuestMessage(proposal, p));
      player_messages.push([p, resp.ts]);
    }));

    // Helper to update voting status for all players
    const updateVotingStatus = () => {
      player_messages.forEach(([p, ts]) => {
        let updated_version = this.voteForQuestMessage(proposal, p, approveVotes, rejectVotes);
        this.api.chat.update({ ...updated_version, ts: ts });
      })
    };

    // Collect votes from button clicks using addActionListener
    const approveVotes = [];
    const rejectVotes = [];
    const votedPlayers = new Set();
    const voteResolvers = new Map(); // Store promise resolvers for each player

    // We convert to a Set because in development we sometimes use a setup where the game has 5 copies of one single player.
    const uniquePlayers: {id: string}[] = [...new Set(this.players.map((p: any) => p.id))].map((id: string) => this.players.find((p: any) => p.id === id));

    // Create promises for each player's vote
    const votePromises = uniquePlayers.map((p: {id: string}) => {
      return new Promise(resolve => {
        voteResolvers.set(p.id, resolve);
      });
    });

    // Register a single action listener for all button clicks
    const actionListenerId = this.bolt.addActionListener("quest-team-vote", async (context) => {
      const userId = context.body.user.id;
      const action = context.body.actions[0];
      const voteValue = action.value; // "approve" or "reject"

      if (votedPlayers.has(userId)) return; // Already voted

      const player = uniquePlayers.find(p => p.id === userId);
      if (!player) return; // Not a valid player

      votedPlayers.add(userId);
      const approve = voteValue === "approve";

      if (approve) approveVotes.push(player);
      else rejectVotes.push(player);

      updateVotingStatus();

      // Resolve the promise for this player
      const resolver = voteResolvers.get(userId);
      if (resolver) {
        resolver({ player, approve });
      }
    });

    const votes = await Promise.all(votePromises);

    // Clean up the action listener
    this.bolt.removeActionListener(actionListenerId);

    // After all votes are in, update quest history for all players
    player_messages.map(([p, ts]) => {
      let updated_version = this.questHistoryMessage(proposal, p, approveVotes, rejectVotes);
      this.api.chat.update({ ...updated_version, ts: ts });
    })

    return approveVotes.length > rejectVotes.length;
  }

  getStatus(current: boolean): string {
    let status = this.questManager.getProgress().map((res, i) => {
      let questAssign =
        Avalon.QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][i];
      let circle = res == "good" ? ":large_blue_circle:" : ":red_circle:";
      return `${questAssign.n}${questAssign.f > 1 ? "*" : ""}${circle}`;
    });
    if (current) {
      let questAssign =
        Avalon.QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][
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
            Avalon.QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][
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

  composeQuestMessage(player, questPlayers, leader, playerIdsWhoHaveQuested=[]) {
    let order = this.players.map((p) =>
      p.id == leader.id ? `*${M.formatAtUser(p.id)}*` : M.formatAtUser(p.id),
    );

    const header_blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${Avalon.ORDER[this.questManager.getCurrentQuestNumber()].charAt(0).toUpperCase() + Avalon.ORDER[this.questManager.getCurrentQuestNumber()].slice(1)} Quest - In Progress`,
          emoji: true
        }
      },
      ...MessageBlockBuilder.createQuestProgressBlocks(this.questManager.getProgress(), Avalon.ORDER, true, Avalon.QUEST_ASSIGNS, this.players.length - Avalon.MIN_PLAYERS, this.questManager.getCurrentQuestNumber()),
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
    if(questPlayers.map(x => x.id).includes(player.id) && !playerIdsWhoHaveQuested.includes(player.id)) {

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
      if(!["good", "merlin", "percival"].includes(player.role)) {
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

    return {
      channel: this.playerDms[player.id],
      blocks: [
        ...header_blocks,
        ...summary_blocks,
        ...action_blocks
      ]
    }
  }

  async runQuest(questPlayers: Player[], leader: Player): Promise<boolean> {
    // 1. Send quest messages to all players and collect their message timestamps
    const player_messages = new Map();
    await Promise.all(this.players.map(async (p) => {
      const message = this.composeQuestMessage(p, questPlayers, leader);
      const resp = await this.api.chat.postMessage(message);
      player_messages.set(p.id, resp.ts);
    }));

    // 2. For each questing player, wait for their DM response (succeed/fail)
    const failed = [];
    const succeeded = [];
    const playerIdsWhoHaveQuested = new Set();

    // Use action listener for quest votes
    const questVoteResolvers = new Map();
    const questVotePromises = new Map();

    questPlayers.map((player) => {
      const promise = new Promise(resolve => {
        questVoteResolvers.set(player.id, resolve);
      });
      questVotePromises.set(player.id, promise);
    });

    // Register a single action listener for all quest succeed/fail button clicks
    const questActionListenerId = this.bolt.addActionListener("quest-success-vote", async (context) => {
      const userId = context.body.user.id;
      const action = context.body.actions[0];
      const voteValue = action.value; // "succeed" or "fail"

      // Only allow questing players who haven't voted yet
      if (!questPlayers.some(p => p.id === userId)) return;
      if (playerIdsWhoHaveQuested.has(userId)) return;

      playerIdsWhoHaveQuested.add(userId);
      const player = questPlayers.find(p => p.id === userId);
      const fail = voteValue === "fail";
      if (fail) failed.push(player);
      else succeeded.push(player);

      // Update quest status for all players
      this.players.forEach(p => {
        const message = this.composeQuestMessage(p, questPlayers, leader, Array.from(playerIdsWhoHaveQuested));
        this.api.chat.update({ ...message, ts: player_messages.get(p.id) });
      });

      // Resolve the promise for this player
      const resolver = questVoteResolvers.get(userId);
      if (resolver) {
        resolver({ player, fail });
      }
    });

    await Promise.all(questVotePromises.values());

    // Clean up the action listener
    this.bolt.removeActionListener(questActionListenerId);

    // 3. After all votes, update quest results, broadcast the outcome, and return the quest score object
    let questAssign = this.questManager.getCurrentQuestAssignment();
    let questResult;
    if (failed.length > 0) {
      if (failed.length < questAssign.f) {
        this.questManager.recordQuestResult("good");
        await this.broadcastQuestResult(questPlayers, "success", failed.length, 0);
        questResult = "good";
      } else {
        this.questManager.recordQuestResult("bad");
        await this.broadcastQuestResult(questPlayers, "failure", failed.length, questAssign.f);
        questResult = "bad";
      }
    } else {
      this.questManager.recordQuestResult("good");
      await this.broadcastQuestResult(questPlayers, "success", 0, 0);
      questResult = "good";
    }
    // 4. Await the endgame evaluation
    await this.evaluateEndGame(this.questManager.calculateScore());
    return true;
  }

  async broadcastQuestResult(questPlayers: Player[], result: "success" | "failure", failCount: number, failsRequired: number): Promise<void> {
    const blocks: any[] = [];

    // Header
    const questName = Avalon.ORDER[this.questManager.getCurrentQuestNumber()].charAt(0).toUpperCase() + Avalon.ORDER[this.questManager.getCurrentQuestNumber()].slice(1);
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
    await Promise.all(this.players.map(p => {
      return this.api.chat.postMessage({
        channel: this.playerDms[p.id],
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
      let merlinArray = this.players.filter((player) => player.role == "merlin");
      if (!merlinArray.length) {
        this.endGame(
          `:large_blue_circle: Loyal Servants of Arthur win by succeeding 3 quests!`,
          "#08e",
          false
        );
        return;
      }
      let assassin = this.assassin;
      let merlin = merlinArray[0];
      const killablePlayers = this.players.filter((p) => p.role && RoleManager.isGoodPlayer(p.role));
      await this.assassinMerlinKill(assassin, merlin, killablePlayers);
    }
  }

  async assassinMerlinKill(assassin: Player, merlin: Player, killablePlayers: Player[]): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Broadcast assassination phase announcement
    const announcementBlocks = MessageBlockBuilder.createAssassinationAnnouncementBlocks(assassin.id);

    this.players.forEach(p => {
      this.api.chat.postMessage({
        channel: this.playerDms[p.id],
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
      this.playerDms[assassin.id],
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
      this.players,
      this.questManager.getProgress(),
      Avalon.ORDER,
      Avalon.QUEST_ASSIGNS,
      this.players.length - Avalon.MIN_PLAYERS
    );
    this.players.forEach(p => {
      this.api.chat.postMessage({
        channel: this.playerDms[p.id],
        blocks: resultBlocks,
        text: accused.role === "merlin" ? "Evil wins! Assassin killed Merlin!" : "Good wins! Assassin missed!"
      });
    });

    this.quit();
  }
}

module.exports = Avalon;
