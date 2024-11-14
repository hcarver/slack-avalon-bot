"use strict";

import { App } from "@slack/bolt";
import { GenericMessageEvent } from "@slack/types";
import * as rx from "rx";
import { ActionPayload } from "./action_payloads";

const _ = require("lodash");
const SlackApiRx = require("./slack-api-rx");
const M = require("./message-helpers");
const Avalon = require("./avalon");

export class Bot {
  isPolling: boolean;
  api: any;
  gameConfig: any;
  gameConfigParams: any;
  game: any;
  bolt: App;

  // Public: Creates a new instance of the bot.
  //
  // token - An API token from the bot integration
  constructor(token, connectionToken) {
    this.bolt = new App({
      token,
      appToken: connectionToken,
      socketMode: true,
    });

    // this.slack = new Slack.RtmClient(token, {
    //   logLevel: process.env.LOG_LEVEL || "error",
    //   autoReconnect: true,
    //   autoMark: true,
    //   useRtmConnect: true,
    // });
    this.api = this.bolt.client;

    this.gameConfig = Avalon.DEFAULT_CONFIG;
    this.gameConfigParams = ["timeout", "mode"];
  }

  // Public: Brings this bot online and starts handling messages sent to it.
  async login() {
    await this.bolt.start();

    this.respondToMessages();
  }

  // Private: Listens for messages directed at this bot that contain the word
  // 'deal,' and poll players in response.
  //
  // Returns a {Disposable} that will end this subscription
  respondToMessages() {
    this.bolt.event(
      "member_joined_channel",
      async ({ event, client, logger }) => {
        client.chat.postMessage({
          channel: event.channel,
          text: this.welcomeMessage(),
        });
      },
    );

    const messages = rx.Observable.create<GenericMessageEvent>((observer) => {
      this.bolt.event("message", async ({ event, client, logger }) => {
        if (event.subtype === undefined) {
          observer.onNext(event as GenericMessageEvent);
        }
      });

      /* this covers buttons, checkboxes etc. from block kit messages.
         For now we just synthesize a message

         Unhelpfully, the slack typescript definitions don't know about this data - see https://api.slack.com/reference/interaction-payloads/block-actions
         */
      this.bolt.action(
        { block_id: /quest-team-vote|quest-success-vote/ },
        async ({ action, body, ack }) => {
          await ack();
          const blockPayload = body as ActionPayload;
          const ts = blockPayload.actions[0].action_ts;

          const syntheticMessage = {
            type: "message",
            subtype: undefined,
            channel: blockPayload.channel.id,
            channel_type: "mpim",
            user: blockPayload.user.id,
            ts,
            event_ts: ts,
            text: blockPayload.actions[0].value,
          } satisfies GenericMessageEvent;
          observer.onNext(syntheticMessage);
        },
      );
    });

    let disp = new rx.CompositeDisposable();

    disp.add(this.handleStartGameMessages(messages));
  }

  includeRole(role) {
    this.excludeRole(role);
    this.gameConfig.specialRoles.push(role);
  }

  excludeRole(role) {
    let index = this.gameConfig.specialRoles.indexOf(role);
    if (index >= 0) {
      this.gameConfig.specialRoles.splice(index, 1);
      return true;
    }
    return false;
  }

  // Private: Looks for messages directed at the bot that contain the word
  // "deal." When found, start polling players for a game.
  //
  // messages - An {Observable} representing messages posted to a channel
  //
  // Returns a {Disposable} that will end this subscription
  handleStartGameMessages(messages: rx.Observable<GenericMessageEvent>) {
    const trigger = messages
      .where((e) => e.subtype === undefined)
      .concatMap((e) => {
        return rx.Observable.fromPromise(
          (async () => {
            const result = await this.api.conversations.info({
              channel: e.channel,
            });
            return { event: e, channel: result.channel };
          })(),
        );
      });

    return trigger
      .where(({ channel }) => {
        return !channel.is_im && !channel.is_mpim;
      })
      .where(
        ({ channel, event }) =>
          event.text &&
          event.text.toLowerCase().match(/^play (avalon|resistance)|dta/i) !=
            null,
      )
      .where(({ channel, event }) => {
        this.gameConfig.resistance = event.text.match(/resistance/i);
        if (this.isPolling) {
          return false;
        } else if (this.game) {
          this.bolt.client.chat.postMessage({
            text: "Another game is in progress, quit that first.",
            channel: channel.id,
          });
          return false;
        }
        return true;
      })
      .flatMap(({ channel, event }) =>
        this.pollPlayersForGame(messages, { id: channel.id }, event.user, null, null),
      )
      .flatMap((starter) => {
        this.isPolling = false;
        this.addBotPlayers(starter.players);

        return this.startGame(starter.players, messages, starter.channel);
      })
      .subscribe();
  }

  // Posts a message to the channel with some timeout, that edits
  // itself each second to provide a countdown.
  //
  // channel - The channel to post in
  // formatMessage - A function that will be invoked once per second with the
  //                 remaining time, and returns the formatted message content
  // scheduler - The scheduler to use for timing events
  // timeout - The duration of the message, in seconds
  //
  // Returns an {Observable} sequence that signals expiration of the message
  postMessageWithTimeout(channel, formatMessage, scheduler, timeout) {
    const sendMessagePromise = this.bolt.client.chat.postMessage({
      text: formatMessage(timeout),
      channel: channel.id,
    });

    let sendMessage = rx.Observable.fromPromise(sendMessagePromise);

    let timeExpired = sendMessage
      .flatMap((payload) => {
        return rx.Observable.timer(0, 1000, scheduler)
          .take(timeout + 1)
          .do((x) => {
            this.api.chat.update({
              ts: payload.ts,
              channel: channel.id,
              text: formatMessage(`${timeout - x}`),
            });
          });
      })
      .publishLast();

    return timeExpired;
  }

  // Private: Polls players to join the game, and if we have enough, starts an
  // instance.
  //
  // messages - An {Observable} representing messages posted to the channel
  // channel - The channel where the deal message was posted
  //
  // Returns an {Observable} that signals completion of the game
  pollPlayersForGame(messages, channel, initiator, scheduler, timeout) {
    scheduler = scheduler || rx.Scheduler.timeout;
    timeout = timeout || 60;
    this.isPolling = true;

    if (this.gameConfig.resistance) {
      this.bolt.client.chat.postMessage({
        text: "Who wants to play Resistance? https://amininima.files.wordpress.com/2013/05/theresistance.png",
        channel: channel.id,
      });
    } else {
      this.bolt.client.chat.postMessage({
        text: "Who wants to play Avalon?",
        channel: channel.id,
      });
    }

    // let formatMessage = t => [
    //   'Respond with:',
    //   '\t`include percival,morgana,mordred,oberon,lady` to include special roles',
    //   '\t`add <player1>,<player2>` to add players',
    //   `\t\`yes\` to join${M.timer(t)}.`
    // ].join('\n');
    let formatMessage = (t) =>
      `Respond with *'yes'* in this channel${M.timer(t)}.`;
    let timeExpired = this.postMessageWithTimeout(
      channel,
      formatMessage,
      scheduler,
      timeout,
    );

    // Look for messages containing the word 'yes' and map them to a unique
    // user ID, constrained to `maxPlayers` number of players.
    let pollPlayers = messages
      .where(
        (e) => e.text && e.text.toLowerCase().match(/\byes\b|dta/i) != null,
      )
      //.where((e) => e.user !== this.self_id) (bot messages excluded by subtype)
      .map((e) => e.user);
    timeExpired.connect();

    let newPlayerStream =
      rx.Observable.merge(pollPlayers).takeUntil(timeExpired);

    return newPlayerStream
      .bufferWithTime(300)
      .reduce((players: string[], newPlayers: string[]) => {
        if (newPlayers.length) {
          let messages = [];
          let joinedAlready = [];
          newPlayers = newPlayers.filter((player) => {
            if (players.find((p) => p === player)) {
              joinedAlready.push(player);
              return false;
            }
            return true;
          });
          if (joinedAlready.length) {
            messages.push(
              `${M.pp(joinedAlready)} ${
                joinedAlready.length > 1 ? "are" : "is"
              } already in the game.`,
            );
          }
          if (players.length + newPlayers.length > Avalon.MAX_PLAYERS) {
            let excessPlayers = newPlayers.slice(Avalon.MAX_PLAYERS);
            newPlayers = newPlayers.slice(0, Avalon.MAX_PLAYERS);
            messages.push(
              `${M.pp(newPlayers)} ${
                newPlayers.length > 1 ? "have" : "has"
              } joined the game.`,
            );
            messages.push(
              `${M.pp(excessPlayers)} cannot join because game is full.`,
            );
          } else if (newPlayers.length) {
            messages.push(
              `${M.pp(newPlayers)} ${
                newPlayers.length > 1 ? "have" : "has"
              } joined the game.`,
            );
          }
          players.splice(0, 0, ...newPlayers);

          if (players.length > 1 && players.length < Avalon.MAX_PLAYERS) {
            messages.push(
              `${players.length} players ${M.pp(players)} are in game so far.`,
            );
          } else if (players.length == Avalon.MAX_PLAYERS) {
            messages.push(
              `Maximum ${players.length} players ${M.pp(
                players,
              )} are in game so far.`,
            );
          }
          this.bolt.client.chat.postMessage({
            text: messages.join("\n"),
            channel: channel.id,
          });
        }
        return players;
      }, [])
      .map((players) => {
        return { channel: channel, players: players };
      });
  }

  // Private: Starts and manages a new Avalon game.
  //
  // players - The players participating in the game
  // messages - An {Observable} representing messages posted to the channel
  // channel - The channel where the game will be played
  //
  // Returns an {Observable} that signals completion of the game
  startGame(players, messages, channel) {
    if (players.length < Avalon.MIN_PLAYERS) {
      // TODO: send status back to webpage
      this.bolt.client.chat.postMessage({
        text: `Not enough players for a game. Avalon requires ${Avalon.MIN_PLAYERS}-${Avalon.MAX_PLAYERS} players.`,
        channel: channel.id,
      });
      return rx.Observable.empty();
    }

    this.bolt.client.chat.postMessage({
      text: `Starting game now. Check your DMs!`,
      channel: channel.id,
    });

    let game = (this.game = new Avalon(this.api, this.bolt, messages, channel, players));
    _.extend(game, this.gameConfig);

    // TODO allow quitting again
    //    // Listen for messages directed at the bot containing 'quit game.'
    //    let quitGameDisp = messages
    //      .where((e) => e.text && e.text.match(/^quit game/i))
    //      .take(1)
    //      .subscribe((e) => {
    //        // TODO: Should poll players to make sure they all want to quit.
    //        let player = this.slack.dataStore.getUserById(e.user);
    //        this.slack.sendMessage(
    //          `${M.formatAtUser(player)} has decided to quit the game.`,
    //          channel.id,
    //        );
    //        game.endGame(`${M.formatAtUser(player)} has decided to quit the game.`);
    //      });

    return SlackApiRx.openDms(this.api, players)
      .flatMap((playerDms) =>
        rx.Observable.timer(2000).flatMap(() => game.start(playerDms)),
      )
      .do(() => {
        // quitGameDisp.dispose();
        this.game = null;
      });
  }

  // Private: Adds AI-based players (primarily for testing purposes).
  //
  // players - The players participating in the game
  addBotPlayers(players) {}

  welcomeMessage() {
    return `Hi! I can host Avalon games. Type \`play avalon\` to play.`;
  }

  async getChannels() {
    const conversations = await this.api.users.conversations();
    const allChannels = conversations.channels;

    return allChannels.filter(
      (c) => (c.is_channel || c.is_group) && !c.is_archived,
    );
  }

  // Private: Save which channels and groups this bot is in and log them.
  async onClientOpened() {
    const conversations = await this.api.users.conversations();
    const allChannels = conversations.channels;

    let channels = allChannels.filter((c) => c.is_channel);
    let groups = allChannels.filter((c) => c.is_group && !c.is_archived);
    let dms = allChannels.filter((c) => c.is_im);

    if (channels.length > 0) {
      console.log(`You are in: ${channels.map((c) => c.name).join(", ")}`);
    } else {
      console.log("You are not in any channels.");
    }

    if (groups.length > 0) {
      console.log(`As well as: ${groups.map((g) => g.name).join(", ")}`);
    }

    if (dms.length > 0) {
      const names = await Promise.all(
        dms.map((dm) => this.api.users.info({ user: dm.user })),
      );

      console.log(
        `Your open DM's: ${names
          .map((user_resp) => user_resp.user.name)
          .join(", ")}`,
      );
    }
  }
}

module.exports = Bot;
