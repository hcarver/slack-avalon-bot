"use strict";

class SlackApiRx {
  // Public: Retrieves DM channels for all of the given users, opening any that
  // do not already exist.
  //
  // slackApi - An instance of the Slack client
  // users - The users to fetch DM channels for
  //
  // Returns a {Promise} that resolves with the DM channels
  static async openDms(api, users) {
    const dmPromises = users.map(user => SlackApiRx.openDm(api, user));
    const dmResults = await Promise.all(dmPromises);
    
    const result = {};
    dmResults.forEach(x => {
      result[x.id] = x.dm;
    });
    
    return result;
  }

  // Private: Maps the `im.open` API call into a {Promise}.
  //
  // Returns a {Promise} that resolves with the DM channel info, or rejects if the API
  // call fails
  static openDm(api, user) {
    return api.conversations.open({ users: user }).then((resp) => {
      return { id: user, dm: resp.channel.id };
    });
  }
}

module.exports = SlackApiRx;
