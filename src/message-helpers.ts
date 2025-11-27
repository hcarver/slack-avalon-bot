import { Player } from "./types";

export class MessageHelpers {
  static formatAtUser(user_id: string | Player | { id: string }): string {
    // Accept either an id string, or an object like {id: some_string}.
    const id = typeof user_id === 'string' ? user_id : user_id.id;
    return `<@${id}>`;
  }

  static pp(userArray: (string | Player | { id: string })[]): string {
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
