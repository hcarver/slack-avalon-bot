"use strict";

import { webApi } from "@slack/bolt";

import { GameUILayer } from "./game-ui-layer.js";

const _ = require("lodash");
const M = require("./message-helpers");
require("string_score");

export class Avalon {
  players: any;
  playerDms: any;
  gameUx: GameUILayer;
  api: webApi.WebClient;
  messages: any;
  date: any;
  channel: any;
  isRunning;
  questNumber;
  rejectCount;
  progress;
  specialRoles;
  evils;
  assassin;
  subscription;
  resistance;
  questPlayers;
  bolt: any; // Added for message listening
  private _gameEnded: boolean = false;
  private currentLeaderIndex: number;

  static MIN_PLAYERS = 5;

  static MAX_PLAYERS = 10;

  static DEFAULT_CONFIG = {
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

  static ROLE_ASSIGNS = [
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

  static QUEST_ASSIGNS = [
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

  static getAssigns(numPlayers, specialRoles, resistance) {
    resistance = resistance || false;
    let assigns = Avalon.ROLE_ASSIGNS[numPlayers - Avalon.MIN_PLAYERS].slice(0);
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

  constructor(gameUx, api, bolt, channel, players) {
    this.api = api;
    this.gameUx = gameUx;
    this.bolt = bolt;

    this.channel = channel;
    this.players = players.map((id) => {
      return { id: id };
    });
    _.extend(this, Avalon.DEFAULT_CONFIG);
    this._gameEnded = false;
  }

  start(playerDms, timeBetweenRounds) {
    timeBetweenRounds = timeBetweenRounds || 1000;
    this.isRunning = true;
    this.questNumber = 0;
    this.rejectCount = 0;
    this.progress = [];
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

    const presentRoles = players.map(p => p.role);

    let specialRoles = Object.keys(Avalon.ROLES)
    .filter((role) => presentRoles.indexOf(role) >= 0)
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
      let message = `You are ${Avalon.ROLES[player.role]}`;
      let extra_info = "";

      if (this.assassin.id == player.id && player.role != "assassin") {
        extra_info += "You are also :crossed_swords: THE ASSASSIN. ";
      }
      if (player.role == "merlin") {
        let evilButMordred = evils.filter((p) => p.role != "mordred");
        if (evilButMordred.length == evils.length) {
          extra_info = `${M.pp(evils)} are evil.`;
        } else {
          extra_info = `. ${M.pp(evilButMordred)} are evil. MORDRED is hidden.`;
        }
      } else if (player.role == "percival") {
        let merlins = players.filter(
          (p) => p.role == "morgana" || p.role == "merlin",
        );

        if (merlins.length == 1) {
          extra_info = `${M.formatAtUser(merlins[0].id)} is MERLIN`;
        } else if (merlins.length > 1) {
          extra_info = `One of ${M.pp(merlins)} is MERLIN, the other is MORGANA.`;
        }
      } else if (player.role != "good" && player.role != "oberon") {
        if (knownEvils.length == evils.length) {
          extra_info += `${M.pp(knownEvils)} are evil`;
        } else {
          extra_info += `${M.pp(knownEvils)} are evil. OBERON is unknown to you.`;
        }
      }

      const user_blocks = [...all_player_blocks,
        { type: "markdown", text: message },
        { type: "markdown", text: extra_info }
      ]

      this.gameUx.send_message(
        this.playerDms[player.id],
        "Starting Avalon game",
        user_blocks
      );
    }

    this._gameEnded = false;
    (async () => {
      while (!this._gameEnded) {
        await this.playRound();
      }
    })();
    return Promise.resolve();
  }

  getRoleAssigns(roles) {
    return _.shuffle(roles);
  }

  playerOrder(players) {
    return _.shuffle(players);
  }

  getAssassin() {
    let assassin = this.evils.filter((player) => player.role == "assassin");
    if (assassin.length) {
      assassin = assassin[0];
    } else {
      assassin = _.shuffle(this.evils)[0];
    }
    return assassin;
  }

  quit() {
    this._gameEnded = true;
    this.isRunning = false;
    // this.endTimeout = setTimeout(() => this.chatSubscription.dispose(), 60000);
  }

  async playRound() {
    const leader = this.players[this.currentLeaderIndex];
    await this.deferredActionForPlayer(leader);
    this.currentLeaderIndex = (this.currentLeaderIndex + 1) % this.players.length;
  }

  revealRoles(excludeMerlin) {
    let lines = [`${M.pp(this.evils)} are :red_circle: Minions of Mordred.`];
    let reveals = {};
    for (let player of this.players) {
      if (player.role == "merlin" && !excludeMerlin) {
        reveals["merlin"] = `${M.formatAtUser(player.id)} is :angel: MERLIN.`;
      } else if (player.role == "percival") {
        reveals["percival"] = `${M.formatAtUser(player.id)} is :cop: PERCIVAL.`;
      } else if (player.role == "morgana") {
        reveals["morgana"] = `${M.formatAtUser(
          player.id,
        )} is :japanese_ogre: MORGANA.`;
      } else if (player.role == "mordred") {
        reveals["mordred"] = `${M.formatAtUser(
          player.id,
        )} is :smiling_imp: MORDRED.`;
      } else if (player.role == "oberon") {
        reveals["oberon"] = `${M.formatAtUser(player.id)} is :alien: OBERON.`;
      }
    }
    return lines
      .concat(
        Object.keys(Avalon.ROLES)
          .filter((role) => !!reveals[role])
          .map((role) => reveals[role])
          .join(" "),
      )
      .join("\n");
  }

  endGame(message, color, current) {
    let status = `Quest Results: ${this.getStatus(current)}`;
    message += `\n${status}\n${this.revealRoles(false)}`;
    this.broadcast(message, color, "end");
    this.quit();
  }

  broadcast(message, color?, special?) {
    let attachment: any = {
      fallback: message,
      text: message,
      mrkdwn_in: ["pretext", "text"],
      color: undefined,
      pretext: undefined,
      thumb_url: undefined,
    };
    if (color) attachment.color = color;
    if (special == "end") {
      attachment.pretext = `*End Avalon Game* (${this.date})`;
    }

    this.players.map((p) => {
      this.api.chat.postMessage({
        channel: this.playerDms[p.id],
        attachments: [attachment],
      });
    });
  }

  questAssign() {
    return Avalon.QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][
      this.questNumber
    ];
  }

  async deferredActionForPlayer(player, timeToPause?) {
    timeToPause = timeToPause || 3000;
    await new Promise(resolve => setTimeout(resolve, timeToPause));

    const questAssign = this.questAssign();
    let f = "";
    if (questAssign.f > 1) {
      f = "(2 fails required) ";
    }
    let message = ` ${questAssign.n} players ${f}to go on the ${
      Avalon.ORDER[this.questNumber]
    } quest.`;
    let status = `Quest progress: ${this.getStatus(true)}\n`;
    let order = this.players.map((p) =>
      p.id == player.id
        ? `*${M.formatAtUser(p.id)}*`
        : M.formatAtUser(p.id),
    );
    status += `Player order: ${order}\n`;

    const full_message = `${status}${M.formatAtUser(
      player.id,
    )} will choose${message} (attempt number ${this.rejectCount + 1})`;

    this.broadcast(full_message, "#a60", "");

    const successful = await this.choosePlayersForQuest(player);
    if (successful) {
      this.rejectCount = 0;
      await new Promise(resolve => setTimeout(resolve, timeToPause));
      return await this.runQuest(this.questPlayers, player);
    }
    this.rejectCount++;
    if (this.rejectCount >= 5) {
      this.endGame(
        `:red_circle: Minions of Mordred win due to the ${
          Avalon.ORDER[this.questNumber]
        } quest rejected 5 times!`,
        "#e00",
        true,
      );
    }
    return true;
  }

  questHistoryMessage(sendingPlayerId, questingPlayerIds, questNumber, to_player, approving_players=[], rejecting_players=[]) {
    let message = `${M.formatAtUser(sendingPlayerId)} nominated ${M.pp(
      questingPlayerIds,
    )} for the ${Avalon.ORDER[questNumber]} quest.`;

    const voting_summary = approving_players.length > 0
    ? (
      rejecting_players.length > 0
      ? `approved by ${M.pp(approving_players)}, rejected by ${M.pp(rejecting_players)}`
      : "everyone accepted the team"
    )
    : "everyone rejected the team"

    const voting_update =
      approving_players.length > rejecting_players.length
        ?  `Team accepted (${voting_summary}).`
        : `Team rejected (${voting_summary}).`

    return {
      channel: this.playerDms[to_player.id],
      text: `${message}\n${voting_update}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${message}\n${voting_update}`
          },
        },
      ]
    }
  }

  voteForQuestMessage(sendingPlayerId, questingPlayerIds, questNumber, to_player, approving_players=[], rejecting_players=[]) {
    let message = `${M.formatAtUser(sendingPlayerId)} is nominating ${M.pp(
      questingPlayerIds,
    )} for the ${Avalon.ORDER[questNumber]} quest (attempt number ${this.rejectCount + 1}).`;

    const usersByVoteStatus = Object.groupBy(this.players, ({id}) => (approving_players.map(x=>x.id).includes(id) || rejecting_players.map(x => x.id).includes(id)).toString())

    let voting_update = (usersByVoteStatus["true"] || []).length === 0 ?
      "No one's voted yet." :
      `${M.pp(usersByVoteStatus["true"])} voted.` +
      (!!usersByVoteStatus["false"] ?
       ` Still waiting on ${M.pp(usersByVoteStatus["false"])}.`:
       "");

    if(approving_players.length + rejecting_players.length === this.players.length) {
      if(approving_players.length > rejecting_players.length) {
        voting_update = `Team accepted (approved by ${M.pp(approving_players)}, rejected by ${M.pp(rejecting_players)}.`
      }
      else {
        voting_update = `Team rejected (approved by ${M.pp(approving_players)}, rejected by ${M.pp(rejecting_players)}.`
      }
    }

    if(approving_players.map(x => x.id).includes(to_player.id) || rejecting_players.map(x => x.id).includes(to_player.id)) {
      return {
        channel: this.playerDms[to_player.id],
        text: `${message}\n${voting_update}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${message}\n${voting_update}`
            },
          },
        ]
      }
    }

    return {
      channel: this.playerDms[to_player.id],
      text: `${message}\n${voting_update}\nVote with \`approve\` or \`reject\``,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: message,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: voting_update,
          },
        },
        {
          type: "actions",
          block_id: "quest-team-vote",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: ":white_check_mark: Approve",
                emoji: true,
              },
              value: "approve",
              action_id: "approve",
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: ":x: Reject",
                emoji: true,
              },
              value: "reject",
              action_id: "reject",
            },
          ],
        },
      ],
    }
  }

  async choosePlayersForQuest(player) {
    let questAssign = this.questAssign();

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
    this.questPlayers = questPlayers;

    // Send voting messages to all players and collect their message timestamps
    // List of player ids and timestamps
    // This is necessary, rather than a map, because we use the same player id multiple times in dev
    const player_messages: Array<[{id: string}, string]> = [];
    await Promise.all(this.players.map(async (p) => {
      const resp = await this.api.chat.postMessage(this.voteForQuestMessage(player.id, questPlayers, this.questNumber, p));
      player_messages.push([p, resp.ts]);
    }));

    // Helper to update voting status for all players
    const updateVotingStatus = () => {
      player_messages.forEach(([p, ts]) => {
        let updated_version = this.voteForQuestMessage(player.id, questPlayers, this.questNumber, p, approveVotes, rejectVotes);
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
      let updated_version = this.questHistoryMessage(player.id, questPlayers, this.questNumber, p, approveVotes, rejectVotes);
      this.api.chat.update({ ...updated_version, ts: ts });
    })

    return approveVotes.length > rejectVotes.length;
  }

  getStatus(current) {
    let status = this.progress.map((res, i) => {
      let questAssign =
        Avalon.QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][i];
      let circle = res == "good" ? ":large_blue_circle:" : ":red_circle:";
      return `${questAssign.n}${questAssign.f > 1 ? "*" : ""}${circle}`;
    });
    if (current) {
      let questAssign =
        Avalon.QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][
          this.questNumber
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
    let message = `${M.pp(questPlayers)} are going on the ${
      Avalon.ORDER[this.questNumber]
    } quest.`;
    message += `\nCurrent quest progress: ${this.getStatus(true)}`;
    let order = this.players.map((p) =>
      p.id == leader.id ? `*${M.formatAtUser(p.id)}*` : M.formatAtUser(p.id),
    );
    message += `\nPlayer order: ${order}`;

    const summary_blocks = []
    if(questPlayers.length > playerIdsWhoHaveQuested.length) {
      const still_waiting_on = `Waiting for players: ${M.pp(questPlayers.filter(x => !playerIdsWhoHaveQuested.includes(x.id)))}.`

      summary_blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: still_waiting_on
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
      blocks: [{
        type: "section",
        text: {
            type: "mrkdwn",
            text: message
        }
      },
      ...summary_blocks,
      ...action_blocks]
    }
  }

  async runQuest(questPlayers, leader) {
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
    let questAssign = this.questAssign();
    let questResult;
    if (failed.length > 0) {
      if (failed.length < questAssign.f) {
        this.progress.push("good");
        this.broadcast(
          `${M.pp(questPlayers)} succeeded the ${Avalon.ORDER[this.questNumber]} quest with ${failed.length} fail!`,
          "#08e",
        );
        questResult = "good";
      } else {
        this.progress.push("bad");
        this.broadcast(
          `${failed.length} in (${M.pp(questPlayers)}) failed the ${Avalon.ORDER[this.questNumber]} quest!`,
          "#e00",
        );
        questResult = "bad";
      }
    } else {
      this.progress.push("good");
      this.broadcast(
        `${M.pp(questPlayers)} succeeded the ${Avalon.ORDER[this.questNumber]} quest!`,
        "#08e",
      );
      questResult = "good";
    }
    this.questNumber++;
    let score = { good: 0, bad: 0 };
    for (let res of this.progress) {
      score[res]++;
    }
    // 4. Await the endgame evaluation
    return await this.evaluateEndGame(score);
  }

  async evaluateEndGame(score) {
    if (score.bad == 3) {
      this.endGame(
        `:red_circle: Minions of Mordred win by failing 3 quests!`,
        "#e00",
        false
      );
      return Promise.resolve(true);
    } else if (score.good == 3) {
      let merlin = this.players.filter((player) => player.role == "merlin");
      if (!merlin.length) {
        this.endGame(
          `:large_blue_circle: Loyal Servants of Arthur win by succeeding 3 quests!`,
          "#08e",
          false
        );
        return Promise.resolve(true);
      }
      let assassin = this.assassin;
      merlin = merlin[0];
      let status = `Quest Results: ${this.getStatus(false)}\n`;
      this.broadcast(
        `${status}Victory is near for :large_blue_circle: Loyal Servants of Arthur for succeeding 3 quests!`,
      );
      const killablePlayers = this.players.filter((p) => p.id !== assassin.id);
      await this.assassinMerlinKill(status, assassin, merlin, killablePlayers);
      return Promise.resolve(true);
    }
    return Promise.resolve(true);
  }

  async assassinMerlinKill(status, assassin, merlin, killablePlayers) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.broadcast(
      `*${M.formatAtUser(assassin.id)}* is the :red_circle::crossed_swords:ASSASSIN. They can now try to kill MERLIN.`,
      "#e00",
    );

    const playerChoice = this.gameUx.pollForDecision(
      this.playerDms[assassin.id],
      `Choose who to kill`,
      killablePlayers.map((player) => M.formatAtUser(player)),
      "Kill",
      (user_id) => user_id === assassin.id,
      1,
      1,
    );
    const idx = await playerChoice;
    const accused = killablePlayers[idx[0]];
    if (accused.role != "merlin") {
      this.broadcast(
        `${status}:crossed_swords:${M.formatAtUser(
          assassin.id,
        )} chose ${M.formatAtUser(
          accused.id,
        )} as MERLIN, not :angel:${M.formatAtUser(
          merlin.id,
        )}.\n:large_blue_circle: Loyal Servants of Arthur win!\n${this.revealRoles(
          true,
        )}`,
        "#08e",
        "end",
      );
    } else {
      this.broadcast(
        `${status}:crossed_swords:${M.formatAtUser(
          assassin.id,
        )} chose :angel:${M.formatAtUser(
          accused.id,
        )} correctly as MERLIN.\n:red_circle: Minions of Mordred win!\n${this.revealRoles(
          true,
        )}`,
        "#e00",
        "end",
      );
    }
    this.quit();
    return Promise.resolve(true);
  }
}

module.exports = Avalon;
