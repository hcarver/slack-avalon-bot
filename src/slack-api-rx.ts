"use strict";
const rx = require("rx");

class SlackApiRx {
  // Public: Retrieves DM channels for all of the given users, opening any that
  // do not already exist.
  //
  // slackApi - An instance of the Slack client
  // users - The users to fetch DM channels for
  //
  // Returns an {Observable} that signals completion
  static openDms(api, users) {
    let ret = rx.Observable.fromArray(users)
      .flatMap((user) => {
        const dmProm = SlackApiRx.openDm(api, user);
        return rx.Observable.fromPromise(dmProm);
      })
      .reduce((acc, x) => {
        acc[x.id] = x.dm;
        return acc;
      }, {})
      .publishLast();

    ret.connect();
    return ret;
  }

  // Private: Maps the `im.open` API call into an {Observable}.
  //
  // Returns an {Observable} that signals completion, or an error if the API
  // call fails
  static openDm(api, user) {
    return api.conversations.open({ users: user }).then((resp) => {
      return { id: user, dm: resp.channel.id };
    });
  }
}

module.exports = SlackApiRx;
