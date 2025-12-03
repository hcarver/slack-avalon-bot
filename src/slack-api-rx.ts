"use strict";

export type UserId = string & { readonly __brand: 'UserId' };
export type ChannelId = string & { readonly __brand: 'ChannelId' };
export type DmChannelId = string & { readonly __brand: 'DmChannelId' };

interface DmChannelInfo {
  userId: UserId;
  dmChannelId: DmChannelId;
}

class SlackApiRx {
  // Public: Retrieves DM channels for all of the given users, opening any that
  // do not already exist.
  //
  // slackApi - An instance of the Slack client
  // userIds - The user IDs to fetch DM channels for
  //
  // Returns a {Promise} that resolves with a map of userId -> dmChannelId
  static async openDms(api: any, userIds: UserId[]): Promise<Record<string, DmChannelId>> {
    const dmPromises = userIds.map(userId => SlackApiRx.openDm(api, userId));
    const dmResults = await Promise.all(dmPromises);
    
    const result: Record<string, DmChannelId> = {};
    dmResults.forEach(x => {
      result[x.userId] = x.dmChannelId;
    });
    
    return result;
  }

  // Private: Maps the `im.open` API call into a {Promise}.
  //
  // Returns a {Promise} that resolves with the DM channel info, or rejects if the API
  // call fails
  static async openDm(api: any, userId: UserId): Promise<DmChannelInfo> {
    const resp = await api.conversations.open({ users: userId as string });
    return { 
      userId, 
      dmChannelId: resp.channel.id as DmChannelId 
    };
  }
}

module.exports = SlackApiRx;
export default SlackApiRx;
