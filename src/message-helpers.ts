"use strict";
const _ = require("lodash");

class MessageHelpers {
  static formatAtUser(user_id) {
    // Accept either an id string, or an object like {id: some_string}.
    // This isn't beautiful.
    const id = user_id.id || user_id;
    return `<@${id}>`;
  }

  static pp(userArray) {
    return userArray
      .map((user) => MessageHelpers.formatAtUser(user))
      .join(", ");
  }

  static get CLOCK() {
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

  static timer(t) {
    if (t <= 0) {
      return "";
    }
    let CLOCK = MessageHelpers.CLOCK;
    return ` in ${CLOCK[t % CLOCK.length]}${t}s`;
  }
}

module.exports = MessageHelpers;
