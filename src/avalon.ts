"use strict";

import { App, CheckboxesAction, webApi } from "@slack/bolt";
import { MessageAttachment } from "@slack/types";

const rx = require("rx");
const _ = require("lodash");
const M = require("./message-helpers");
require("string_score");

rx.config.longStackSupport = true;

class GameUILayer {
  api: webApi.WebClient;
  app: App;

  constructor(api, app) {
    this.api = api;
    this.app = app;
  }

  async pollForDecision(
    channel_id,
    heading_text,
    options,
    verb,
    from_filter,
    minimum,
    maximum,
  ) {
    const checkbox_id = `${(Math.random() + 1).toString(36)}`;
    const submit_id = `${(Math.random() + 1).toString(36)}`;
    let selected_options = []

    const done = new Promise((resolve) => {
      this.app.action(
        { action_id: checkbox_id},
        async (request) => {
          request.ack();
          selected_options = (request.action as CheckboxesAction).selected_options.map (x => x.value)
        }
      );

      this.app.action(
        { action_id: submit_id},
        async (request) => {
          const {body, client, ack, logger, payload} = request;
          const say = (request as any).say;
          ack();

          if(selected_options.length < minimum ||
             selected_options.length > maximum){
            if(minimum != maximum) {
              say(`Choose between ${minimum} and ${maximum} options`);
            }
            else {
              say(`Choose ${minimum} options`);
            }
            return;
          }
          const selected_indexes = selected_options.map(x => parseInt(x, 10));
          const selection = selected_indexes.map((idx) => options[idx as number]);

          say(`You chose ${selection.join(", ")}`);
          resolve(selected_indexes);
        }
      );

      const checkboxOptions = options.map(
        (option, idx) => {
          return {text: {type: "mrkdwn", text: option}, value: `${idx}`}
        }
      );

      this.api.chat.postMessage({
        channel: channel_id,
        blocks: [
          { type: "header", text: { type: "plain_text", text: heading_text } },
          { type: "actions",
            elements: [
              { type: "checkboxes",
                action_id: checkbox_id,
                options: checkboxOptions
              }
            ]
          },
          { type: "actions",
            elements: [
              { type: "button",
                action_id: submit_id,
                text: {type: "plain_text", text: verb}
              }
            ]
          }
        ]
      });

    });

    const result = await done;

    return result;
  }
}

export class Avalon {
  players: any;
  playerDms: any;
  gameUx: GameUILayer;
  api: webApi.WebClient;
  bolt: App;
  messages: any;
  date: any;
  scheduler: any;
  channel: any;
  gameEnded;
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

  static MIN_PLAYERS = 5;

  static MAX_PLAYERS = 10;

  static DEFAULT_CONFIG = {
    resistance: false,
    lady: false,
    order: "turn",
    specialRoles: ["merlin", "percival", "morgana"],
  };

  static ROLES = {
    bad: ":red_circle: Minion of Mordred",
    good: ":large_blue_circle: Loyal Servant of Arthur",
    assassin: ":crossed_swords: THE ASSASSIN :red_circle: Minion of Mordred",
    oberon: ":alien: OBERON :red_circle: Minion of Mordred",
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

  constructor(api, bolt, messages, channel, players, scheduler) {
    scheduler = scheduler || rx.Scheduler.timeout;
    this.api = api;
    this.bolt = bolt;
    this.messages = messages;
    this.gameUx = new GameUILayer(this.api, this.bolt);

    this.channel = channel;
    this.players = players.map((id) => {
      return { id: id };
    });
    this.scheduler = scheduler;
    this.gameEnded = new rx.Subject();
    _.extend(this, Avalon.DEFAULT_CONFIG);
  }

  start(playerDms, timeBetweenRounds) {
    timeBetweenRounds = timeBetweenRounds || 1000;
    this.isRunning = true;
    this.questNumber = 0;
    this.rejectCount = 0;
    this.progress = [];
    this.playerDms = playerDms;
    this.date = new Date();

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

    let knownEvils = evils.filter((player) => player.role != "oberon");
    for (let player of this.players) {
      let message = `You are ${Avalon.ROLES[player.role]}`;
      if (this.assassin.id == player.id && player.role != "assassin") {
        message += " as well as :crossed_swords: THE ASSASSIN";
      }
      if (player.role == "merlin") {
        let evilButMordred = evils.filter((p) => p.role != "mordred");
        if (evilButMordred.length == evils.length) {
          message += `. ${M.pp(evils)} are evil.`;
        } else {
          message += `. ${M.pp(evilButMordred)} are evil. MORDRED is hidden.`;
        }
      } else if (player.role == "percival") {
        let merlins = players.filter(
          (p) => p.role == "morgana" || p.role == "merlin",
        );
        if (merlins.length == 1) {
          message += `. ${M.formatAtUser(merlins[0].id)} is MERLIN`;
        } else if (merlins.length > 1) {
          message += `. One of ${M.pp(merlins)} is MERLIN`;
        }
      } else if (player.role != "good" && player.role != "oberon") {
        message += `. ${M.pp(knownEvils)} are evil`;
      }

      this.api.chat.postMessage({
        text: message,
        channel: this.playerDms[player.id],
      });
    }

    this.subscription = rx.Observable.return(true)
      .flatMap(() => this.playRound())
      .repeat()
      .takeUntil(this.gameEnded)
      .subscribe();

    return this.gameEnded;
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
    this.gameEnded.onNext(true);
    this.gameEnded.onCompleted();
    this.isRunning = false;
    this.subscription.dispose();
    // this.endTimeout = setTimeout(() => this.chatSubscription.dispose(), 60000);
  }

  playRound() {
    return rx.Observable.fromArray(this.players).concatMap((player) =>
      this.deferredActionForPlayer(player),
    );
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
    let attachment: MessageAttachment = {
      fallback: message,
      text: message,
      mrkdwn_in: ["pretext", "text"],
      color: undefined,
      pretext: undefined,
      thumb_url: undefined,
    };
    if (color) attachment.color = color;
    if (special == "start") {
      attachment.pretext = `*Start Avalon Game* (${this.date})`;
      let prependText = `${this.evils.length} out of ${this.players.length} players are evil.`;
      let specialRoles = this.players.filter(
        (p) => (p.role != "good" && p.role != "bad") || p.role != "assassin",
      );
      if (specialRoles.length) {
        specialRoles = specialRoles.map((p) => p.role);
        specialRoles = Object.keys(Avalon.ROLES)
          .filter((role) => specialRoles.indexOf(role) >= 0)
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
        attachment.text = `${prependText}\nSpecial roles: ${specialRoles}\n${message}`;
      } else {
        attachment.text = `${prependText}\n${message}`;
      }
      attachment.thumb_url =
        "https://cf.geekdo-images.com/images/pic1398895_md.jpg";
    } else if (special == "end") {
      attachment.pretext = `*End Avalon Game* (${this.date})`;
    }

    this.players.map((p) => {
      this.api.chat.postMessage({
        channel: this.playerDms[p.id],
        attachments: [attachment],
      });
    });
  }

  dmMessages(player) {
    return this.messages.where((e) => e.channel == this.playerDms[player.id]);
  }

  questAssign() {
    return Avalon.QUEST_ASSIGNS[this.players.length - Avalon.MIN_PLAYERS][
      this.questNumber
    ];
  }

  deferredActionForPlayer(player, timeToPause?) {
    timeToPause = timeToPause || 3000;
    return rx.Observable.defer(() => {
      return rx.Observable.timer(timeToPause, this.scheduler).flatMap(() => {
        let questAssign = this.questAssign();
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
        let special =
          this.questNumber == 0 && this.rejectCount == 0 ? "start" : "";

        const full_message = `${status}${M.formatAtUser(
          player.id,
        )} will choose${message} (attempt number ${this.rejectCount + 1})`;

        this.broadcast(full_message, "#a60", special);

        return this.choosePlayersForQuest(player).concatMap((successful) => {
          if (successful) {
            this.rejectCount = 0;
            return rx.Observable.defer(() =>
              rx.Observable.timer(timeToPause, this.scheduler).flatMap(() => {
                return this.runQuest(this.questPlayers, player);
              }),
            );
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
          return rx.Observable.return(true);
        });
      });
    });
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

  choosePlayersForQuest(player) {
    let questAssign = this.questAssign();

    const playerChoice = this.gameUx.pollForDecision(
      this.playerDms[player.id],
      `Choose a team of ${questAssign.n}`,
      this.players.map((player) => M.formatAtUser(player)),
      "Nominate",
      (user_id) => user_id === player.id,
      questAssign.n,
      questAssign.n,
    );

    return rx.Observable.fromPromise(playerChoice)
    .map((idx) => idx.map((i) => this.players[i]))
    .concatMap((questPlayers) => {
      this.questPlayers = questPlayers;

      return rx.Observable.forkJoin(
        this.players.map(p => {
          const posted_message = this.api.chat.postMessage(this.voteForQuestMessage(player.id, questPlayers, this.questNumber, p))

          return new Promise(resolve => posted_message.then(resp => resolve([p.id, resp.ts])))
        })
      )
      .first()
      .flatMap(messages => {
        const player_messages = new Map(messages)

        return rx.Observable.fromArray(this.players)
        .map((p) => {

          return this.dmMessages(p)
          .where((e) => e.user === p.id && e.text)
          .map((e) => e.text.trim().toLowerCase())
          .where(
            (text) =>
            text.score("approve", 0.5) > 0.5 ||
              text.score("reject", 0.5) > 0.5,
          )
          .map((text) => {
            return { player: p, approve: text.score("approve", 0.5) > 0.5 };
          })
          .take(1);
        })
        .mergeAll()
        .take(this.players.length)
        .reduce(
          (acc, vote) => {
            // TODO: bufferWithTime on this
            if (vote.approve) {
              acc.approved.push(vote.player);
            } else {
              acc.rejected.push(vote.player);
            }
            if (acc.approved.length + acc.rejected.length < this.players.length) {
              let voted = acc.approved.concat(acc.rejected);
              let remaining = this.players.length - voted.length;

              this.players.map(p => {
                let updated_version = this.voteForQuestMessage(player.id, questPlayers, this.questNumber, p, acc.approved, acc.rejected)

                this.api.chat.update({...updated_version, ts: player_messages.get(p.id) as string})
              })
            }
            return acc;
          },
          { approved: [], rejected: [] },
        ).map(({approved, rejected}) => {
          const successful = approved.length > rejected.length;

          this.players.map(p => {
            let updated_version = this.questHistoryMessage(player.id, questPlayers, this.questNumber, p, approved, rejected)

            this.api.chat.update({...updated_version, ts: player_messages.get(p.id) as string})
          })

          return successful
        }) ;
      })
    })
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
      action_blocks.push(
        {
          type: "actions",
          block_id: "quest-success-vote",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: ":white_check_mark: Succeed",
                emoji: true,
              },
              value: "succeed",
              action_id: "succeed",
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: ":x: Fail",
                emoji: true,
              },
              value: "fail",
              action_id: "fail",
            },
          ],
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

  runQuest(questPlayers, leader) {
    return rx.Observable.forkJoin(
      this.players.map(p => {
        const message = this.composeQuestMessage(p, questPlayers, leader)
        const posted_message = this.api.chat.postMessage(message)
        return new Promise(resolve => posted_message.then(resp => resolve([p.id, resp.ts])))
      })
    )
      .flatMap(messages => {
        const player_messages = new Map(messages)
        let runners = 0;
        return rx.Observable.fromArray(questPlayers)
          .map((player) => {
            return this.dmMessages(player)
              .where((e) => e.user === player.id && e.text)
              .map((e) => e.text.trim().toLowerCase())
              .where(
                (text) =>
                  text.score("succeed", 0.5) > 0.5 || text.score("fail", 0.5) > 0.5,
              )
              .map((text) => {
                return { player: player, fail: text.score("fail", 0.5) > 0.5 };
              })
              .take(1);
          })
          .mergeAll()
          .take(questPlayers.length)
          .reduce(
            (acc, questResult) => {
              if (questResult.fail) {
                acc.failed.push(questResult.player);
              } else {
                acc.succeeded.push(questResult.player);
              }

              this.players.map(p => {
                const message = this.composeQuestMessage(p, questPlayers, leader, [...acc.failed.map(x => x.id), ...acc.succeeded.map(x => x.id)]);
                this.api.chat.update({...message, ts: player_messages.get(p.id) as string})
              })

              return acc;
            },
            { succeeded: [], failed: [] },
          )
          .map((questResults) => {
            let questAssign = this.questAssign();
            if (questResults.failed.length > 0) {
              if (questResults.failed.length < questAssign.f) {
                this.progress.push("good");
                this.broadcast(
                  `${M.pp(questPlayers)} succeeded the ${
                    Avalon.ORDER[this.questNumber]
                  } quest with ${questResults.failed.length} fail!`,
                  "#08e",
                );
              } else {
                this.progress.push("bad");
                this.broadcast(
                  `${questResults.failed.length} in (${M.pp(
                    questPlayers,
                  )}) failed the ${Avalon.ORDER[this.questNumber]} quest!`,
                  "#e00",
                );
              }
            } else {
              this.progress.push("good");
              this.broadcast(
                `${M.pp(questPlayers)} succeeded the ${
                  Avalon.ORDER[this.questNumber]
                } quest!`,
                "#08e",
              );
            }
            this.questNumber++;
            let score = { good: 0, bad: 0 };
            for (let res of this.progress) {
              score[res]++;
            }
            return score;
          })
      })
          .concatMap((score) => {
            if (score.bad == 3) {
              this.endGame(
                `:red_circle: Minions of Mordred win by failing 3 quests!`,
                "#e00",
                false
              );
            } else if (score.good == 3) {
              let merlin = this.players.filter((player) => player.role == "merlin");
              if (!merlin.length) {
                this.endGame(
                  `:large_blue_circle: Loyal Servants of Arthur win by succeeding 3 quests!`,
                  "#08e",
                  false
                );
                return rx.Observable.return(true);
              }
              let assassin = this.assassin;
              merlin = merlin[0];

              let status = `Quest Results: ${this.getStatus(false)}\n`;
              this.broadcast(
                `${status}Victory is near for :large_blue_circle: Loyal Servants of Arthur for succeeding 3 quests!`,
              );
              return rx.Observable.defer(() => {
                return rx.Observable.timer(1000, this.scheduler).flatMap(() => {
                  this.broadcast(
                    `*${M.formatAtUser(
                      assassin.id,
                    )}* is the :red_circle::crossed_swords:ASSASSIN. They can now try to kill MERLIN.`,
                    "#e00",
                  );

                  const killablePlayers = this.players.filter(
                    (p) => p.id !== assassin.id,
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

                  return rx.Observable.return(true).flatMap(() => {
                    return rx.Observable.fromPromise(playerChoice)
                      .map((idx) => killablePlayers[idx[0]])
                      .do((accused) => {
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
                      });
                  });
                });
              });
            }
            return rx.Observable.return(true);
          });
  }
}

module.exports = Avalon;
