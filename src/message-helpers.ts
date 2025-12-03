import { Player } from "./types";

export class MessageHelpers {
  static formatAtUser(user_id: string | Player | { id: string; userId?: string }): string {
    // Accept either an id string, Player object, or legacy object with id
    if (typeof user_id === 'string') {
      return `<@${user_id}>`;
    }
    // Player object - use userId for Slack mentions
    if ('userId' in user_id && user_id.userId) {
      return `<@${user_id.userId}>`;
    }
    // Legacy object with id
    if ('id' in user_id) {
      return `<@${user_id.id}>`;
    }
    
    return `<@${user_id}>`;
  }

  static pp(userArray: (string | Player | { id: string; userId?: string })[]): string {
    return userArray
      .map((user) => MessageHelpers.formatAtUser(user))
      .join(", ");
  }

  static get CLOCK(): string[] {
    return [
      "🕛",
      "🕚",
      "🕙",
      "🕘",
      "🕗",
      "🕖",
      "🕕",
      "🕔",
      "🕓",
      "🕒",
      "🕑",
      "🕐",
    ];
  }

  static timer(t: number): string {
    if (t <= 0) {
      return "";
    }
    let CLOCK = MessageHelpers.CLOCK;
    return ` in ${CLOCK[t % CLOCK.length]}${t}s`;
  }
}

// Keep CommonJS export for backward compatibility
module.exports = MessageHelpers;
