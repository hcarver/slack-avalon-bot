"use strict";
const rx = require("rx");
const _ = require("lodash");
const M = require("./message-helpers");
require("string_score");

rx.config.longStackSupport = true;

class GameUILayer {
  api: any;
  message_stream: any;

  constructor(api, message_stream) {
    this.api = api;
    this.message_stream = message_stream;
  }

  pollForDecision(
    channel_id,
    heading_text,
    options,
    verb,
    from_filter,
    minimum,
    maximum,
  ) {
    const messages = this.message_stream.where((e) => {
      return e.channel === channel_id;
    });

    const formattedOptions = options.map(
      (option, idx) => `- *${idx}*: ${option}`,
    );

    let sendMessage = rx.Observable.fromCallback(this.api.chat.postMessage);

    sendMessage({
      channel: channel_id,
      blocks: [
        { type: "header", text: { type: "plain_text", text: heading_text } },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: formattedOptions.join("\n"),
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `Choose with, e.g., \`${verb} 1, 2, 3\``,
          },
        },
      ],
    });

    const result = messages
      .where((e) => from_filter(e.user))
      .where((e) => {
        return (
          e.text &&
          e.text.toLowerCase().match(new RegExp(`^${verb.toLowerCase()}`))
        );
      })
      .map((e) => {
        const selection = [
          ...new Set(
            (e.text.match(/\d+/g) || [])
              .map(Number)
              .filter((x) => x >= 0 && x < options.length),
          ),
        ];

        if (selection.length < minimum || selection.length > maximum) {
          const message =
            minimum === maximum
              ? `exactly ${minimum} options`
              : `between ${minimum} and ${maximum} options`;
          sendMessage({
            channel: channel_id,
            text: `You must choose ${message}.`,
          });
        } else {
          const selectedOptions = selection.map((idx) => options[idx as number]);
          sendMessage({
            channel: channel_id,
            text: `You chose ${selectedOptions}`,
          });

          return selection;
        }
      })
      .where((x) => !!x)
      .take(1);

    return result;
  }
}

export class Avalon {
  players: any;
  playerDms: any;
  gameUx: GameUILayer;
  api: any;
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
  leader;
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

  constructor(api, messages, channel, players, scheduler) {
    scheduler = scheduler || rx.Scheduler.timeout;
    this.api = api;
    this.messages = messages;
    this.gameUx = new GameUILayer(this.api, messages);

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
    this.leader = players[0];

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
    let attachment = {
      fallback: message,
      text: message,
      mrkdwn: true,
      mrkdwn_in: ["pretext", "text"],
      color: undefined,
      pretext: undefined,
      thumb_url: undefined
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
    })
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
        )} will choose${message} (in DM)`;

        this.broadcast(full_message, "#a60", special);
        player.action = "sending";

        return this.choosePlayersForQuest(player).concatMap((votes) => {
          let printQuesters = M.pp(this.questPlayers);
          for (let player of this.players) {
            player.action = null;
          }
          if (votes.approved.length > votes.rejected.length) {
            this.broadcast(
              `The ${
                Avalon.ORDER[this.questNumber]
              } quest with ${printQuesters} going was approved by ${M.pp(
                votes.approved,
              )} (${
                votes.rejected.length ? M.pp(votes.rejected) : "no one"
              } rejected)`,
            );
            this.rejectCount = 0;
            return rx.Observable.defer(() =>
              rx.Observable.timer(timeToPause, this.scheduler).flatMap(() => {
                return this.runQuest(this.questPlayers, player);
              }),
            );
          }
          this.rejectCount++;
          this.broadcast(
            `The ${
              Avalon.ORDER[this.questNumber]
            } quest with ${printQuesters} going was rejected (${
              this.rejectCount
            }) by ${M.pp(votes.rejected)} (${
              votes.approved.length ? M.pp(votes.approved) : "no one"
            } approved)`,
          );
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

  choosePlayersForQuest(player) {
    let questAssign = this.questAssign();

    const playerChoice = this.gameUx.pollForDecision(
      this.playerDms[player.id],
      `Choose a team of ${questAssign.n}`,
      this.players.map((player) => M.formatAtUser(player)),
      "nominate",
      (user_id) => user_id === player.id,
      questAssign.n,
      questAssign.n,
    );

    return playerChoice
      .map((idx) => idx.map((i) => this.players[i]))
      .concatMap((questPlayers) => {
        this.questPlayers = questPlayers;
        let message = `${M.formatAtUser(player.id)} is sending ${M.pp(
          questPlayers,
        )} to the ${Avalon.ORDER[this.questNumber]} quest.`;
        this.broadcast(`${message}\nVote in your DMs`, "#555");
        for (let player of this.players) {
          player.action = "voting";
        }
        return rx.Observable.fromArray(this.players)
          .map((p) => {
            this.api.chat.postMessage({
              channel: this.playerDms[p.id],
              text: `${message}\nVote with \`approve\` or \`reject\``,
            });
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
          .mergeAll();
      })
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
            this.broadcast(
              `${M.formatAtUser(vote.player.id)} voted! ${remaining} vote${
                remaining > 1 ? "s" : ""
              } left.`,
            );
          }
          return acc;
        },
        { approved: [], rejected: [] },
      );
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

  runQuest(questPlayers, leader) {
    let message = `${M.pp(questPlayers)} are going on the ${
      Avalon.ORDER[this.questNumber]
    } quest.`;
    message += `\nCurrent quest progress: ${this.getStatus(true)}`;
    let order = this.players.map((p) =>
      p.id == leader.id ? `*${M.formatAtUser(p.id)}*` : M.formatAtUser(p.id),
    );
    message += `\nPlayer order: ${order}`;
    this.leader = leader;
    this.broadcast(
      `${message}\nQuesting players can cast their votes in their DMs.`,
      "#ea0",
    );
    for (let player of questPlayers) {
      player.action = "questing";
    }

    let runners = 0;
    return rx.Observable.fromArray(questPlayers)
      .map((player) => {
        this.api.chat.postMessage({
          channel: this.playerDms[player.id],
          text: `${message}\nShould the quest \`succeed\` or \`fail\`?`,
        });
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
          if (acc.failed.length + acc.succeeded.length < questPlayers.length) {
            let completed = acc.failed.concat(acc.succeeded);
            let remaining = questPlayers.length - completed.length;
            this.broadcast(
              `${M.formatAtUser(
                questResult.player.id,
              )} completed the quest! ${remaining} remaining...`,
            );
          }
          return acc;
        },
        { succeeded: [], failed: [] },
      )
      .map((questResults) => {
        for (let player of questPlayers) {
          player.action = null;
        }
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
              assassin.action = "killing";
              this.broadcast(
                `*${M.formatAtUser(
                  assassin.id,
                )}* is the :red_circle::crossed_swords:ASSASSIN. They can now try to kill MERLIN (via DM)`,
                "#e00",
              );

              const killablePlayers = this.players.filter(
                (p) => p.id !== assassin.id,
              );

              const playerChoice = this.gameUx.pollForDecision(
                this.playerDms[assassin.id],
                `Choose who to kill`,
                killablePlayers.map((player) => M.formatAtUser(player)),
                "kill",
                (user_id) => user_id === assassin.id,
                1,
                1,
              );

              return rx.Observable.return(true).flatMap(() => {
                return playerChoice
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
