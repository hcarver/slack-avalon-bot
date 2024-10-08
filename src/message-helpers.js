"use strict";
const _ = require("lodash");

class MessageHelpers {
  // Public: Checks whether the message text contains an @-mention for the
  // given user.
  static containsUserMention(messageText, userId) {
    let userTag = `<@${userId}>`;
    return messageText && messageText.trim().startsWith(userTag);
  }

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

  static pts(n, space, dollar) {
    space = space || 3;
    dollar = dollar || "";
    return `${n < 0 ? "-" : "+"}${_.padStart(dollar + Math.abs(n), space - 1)}`;
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

  static fix(s, n) {
    return _.padEnd(_.truncate(s, { length: n - 1, omission: "…" }), n);
  }
}

module.exports = MessageHelpers;
