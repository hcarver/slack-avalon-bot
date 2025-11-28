"use strict";

import { App } from "@slack/bolt";

import { GameUILayer } from "./game-ui-layer";
import { BoltListenerManager } from "./infrastructure/BoltListenerManager";

const _ = require("lodash");
const SlackApiRx = require("./slack-api-rx");
const M = require("./message-helpers");
const Avalon = require("./avalon");


export class Bot {
  isPolling: boolean;
  api: any;
  gameConfig: any;
  game: any;
  bolt: BoltListenerManager;

  // Public: Creates a new instance of the bot.
  //
  // token - An API token from the bot integration
  constructor(token, connectionToken) {
    this.bolt = new BoltListenerManager(new App({
      token,
      appToken: connectionToken,
      socketMode: true,
    }));

    // this.slack = new Slack.RtmClient(token, {
    //   logLevel: process.env.LOG_LEVEL || "error",
    //   autoReconnect: true,
    //   autoMark: true,
    //   useRtmConnect: true,
    // });
    this.api = this.bolt.client;

    this.gameConfig = structuredClone(Avalon.DEFAULT_CONFIG);
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
    this.handleStartGameMessages();
  }

  // Private: Looks for messages directed at the bot that contain the word
  // "deal." When found, start polling players for a game.
  //
  // messages - An Observable representing messages posted to a channel
  //
  // Returns nothing (side-effecting async function)
  async handleStartGameMessages() {
    // Use BoltWithListeners directly for event handling
    this.bolt.addMessageListener(async ({event}) => {
      // Only process plain messages
      if (event.subtype !== undefined) return;

      // Get channel info
      const result = await this.api.conversations.info({ channel: event.channel });
      const channel = result.channel;

      // Only process non-DM channels
      if (channel.is_im || channel.is_mpim) return;

      // Only process trigger messages
      if (!event.text || !event.text.toLowerCase().match(/^play (avalon|resistance)|dta/i)) return;

      // Reset config and check for game in progress
      this.gameConfig = structuredClone(Avalon.DEFAULT_CONFIG);
      this.gameConfig.resistance = event.text.match(/resistance/i);
      if (this.isPolling) return;
      if (this.game) {
        this.bolt.client.chat.postMessage({
          text: "Another game is in progress, quit that first.",
          channel: channel.id,
        });
        return;
      }

      // Poll for players
      this.isPolling = true;
      const starter = await this.pollPlayersForGame(channel, event.user);
      this.isPolling = false;

      if(starter.players.length < Avalon.MIN_PLAYERS) {
        this.bolt.client.chat.postMessage({
          text: `Not enough players for a game. Avalon requires ${Avalon.MIN_PLAYERS}-${Avalon.MAX_PLAYERS} players.`,
          channel: channel.id,
        });
      } else {// Announce the final player list
        this.bolt.client.chat.postMessage({
          text: `Going ahead with ${starter.players.length} players: ${starter.players.map(M.formatAtUser).join(", ")}`,
          channel: channel.id,
        });
        await this.startGame(starter.players, channel);
      }
    });
  }

  // Private: Polls players to join the game, and if we have enough, starts an
  // instance.
  //
  // channel - The channel where the deal message was posted
  // gameStarter - The user ID who initiated the game
  //
  // Returns a Promise that resolves to { channel, players, starter }
  async pollPlayersForGame(channel, gameStarter) {
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

    let players = [];
    const playerSet = new Set();

    const formatMessage = () => `Respond with *'yes'* to join the game.\n\n*Players joined (${players.length}/${Avalon.MAX_PLAYERS}):*\n${players.map(M.formatAtUser).join(", ") || "_None yet_"}\n\n${M.formatAtUser(gameStarter)} - type *'start'* when ready to begin (minimum ${Avalon.MIN_PLAYERS} players required).`

    let messageTs: string;
    let startTriggered = false;

    // Handler for collecting players and watching for start
    const messageHandler = async ({event}) => {
      if (event.channel !== channel.id) return;
      if (!event.text) return;

      const text = event.text.toLowerCase();

      // Check if starter said "start"
      if (text.match(/\bstart\b/i) && event.user === gameStarter) {
        startTriggered = true;
        return;
      }

      // Check for new players joining
      if (text.match(/\byes\b|dta/i) && !playerSet.has(event.user)) {
        if(playerSet.size < Avalon.MAX_PLAYERS) {
          playerSet.add(event.user);
          players.push(event.user);

          // Update the message
          await this.api.chat.update({
            ts: messageTs,
            channel: channel.id,
            text: formatMessage()
          });
        } else {
          await this.bolt.client.chat.postMessage({
            text: `Couldn't add ${M.formatAtUser(event.user)} because the game is already full.`,
            channel: channel.id,
          });
        }
      }
    };

    // Listen for messages
    const listenerId = this.bolt.addMessageListener(messageHandler);

    const payload = await this.bolt.client.chat.postMessage({
      text: formatMessage(),
      channel: channel.id,
    });
    messageTs = payload.ts as string;

    // Wait for start command or timeout (5 minutes)
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    const startTime = Date.now();
    let timedOut = false;

    await new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (startTriggered) {
          clearInterval(checkInterval);
          resolve();
        } else if (Date.now() - startTime >= timeoutMs) {
          timedOut = true;
          clearInterval(checkInterval);
          resolve();
        }
      }, 500);
    });

    this.bolt.removeMessageListener(listenerId);

    // If timed out, notify and return empty players
    if (timedOut) {
      await this.bolt.client.chat.postMessage({
        text: `Game signup timed out after 5 minutes. ${players.length > 0 ? `${M.pp(players)} joined but the game was not started.` : 'No players joined.'}`,
        channel: channel.id,
      });
      return { channel, players: [], starter: gameStarter };
    }

    return { channel, players, starter: gameStarter };
  }

  // Private: Starts and manages a new Avalon game.
  //
  // players - The players participating in the game
  // messages - An {Observable} representing messages posted to the channel
  // channel - The channel where the game will be played
  //
  // Returns a {Promise} that signals completion of the game
  async startGame(players, channel) {

    if (players.length < Avalon.MIN_PLAYERS) {
      // TODO: send status back to webpage
      this.bolt.client.chat.postMessage({
        text: `Not enough players for a game. Avalon requires ${Avalon.MIN_PLAYERS}-${Avalon.MAX_PLAYERS} players.`,
        channel: channel.id,
      });
      return Promise.resolve();
    }

    const configuringPlayer = players[Math.floor(Math.random() * players.length)];

    this.bolt.client.chat.postMessage({
      text: `${M.formatAtUser(configuringPlayer)} will now choose the roles in play for this game.`,
      channel: channel.id,
    });

    const configurableRoles = [
      "oberon",
      "morgana",
      "mordred",
      "percival",
    ]

    const gameUx = new GameUILayer(this.api, this.bolt);

    const validateValidRoleChoice = chosen_indexes => {
      const assigns = Avalon.ROLE_ASSIGNS[players.length - Avalon.MIN_PLAYERS]

      const assign_count = assigns.reduce((acc, current) => {
        acc[current] = (acc[current] || 0) + 1
        return acc
      }, {})

      const num_bad = assign_count["bad"]

      const chosen_roles = chosen_indexes.map(index => configurableRoles[index as number])
      const num_bad_chosen = chosen_roles.filter(x => ["oberon", "morgana", "mordred"].includes(x)).length

      if(num_bad_chosen > num_bad) {
        return `You can only choose ${num_bad} evil-aligned roles with this player count`
      }
    }

    const roleChoice = gameUx.pollForDecision(
      configuringPlayer,
      `Choose the roles in the game`,
      configurableRoles.map(role => Avalon.ROLES[role]),
      "Choose",
      (user_id) => user_id === configuringPlayer.id,
      0,
      configurableRoles.length,
      [validateValidRoleChoice]
    );

    try {
      // Wait for role choice
      const role_indexes = await roleChoice as number[];
      const role_names = role_indexes.map(idx => configurableRoles[idx]);

      // Post role selection message
      this.bolt.client.chat.postMessage({
        text: `${M.formatAtUser(configuringPlayer)} chose:\n\n${role_names.map(name => `${Avalon.ROLES[name]}`).join("\n")}\n\nGame starting now!`,
        channel: channel.id,
      });

      // Add roles to game config
      role_names.forEach(role => this.gameConfig.specialRoles.push(role));

      // Create and configure game
      // NOTE: Avalon should create its own messages object in its constructor
      let game = (this.game = new Avalon(gameUx, this.api, this.bolt, channel, players));
      _.extend(game, this.gameConfig);

      // Open DMs for all players
      const playerDms = await SlackApiRx.openDms(this.api, players);

      // Wait 2 seconds then start the game
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start the game
      await this.game.start(playerDms);

      // Clean up
      this.game = null;

    } catch (error) {
      console.error('Error starting game:', error);
      this.game = null;
      throw error;
    }

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
  }


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
