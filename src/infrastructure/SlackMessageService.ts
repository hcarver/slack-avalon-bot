import { webApi } from "@slack/bolt";
import { IMessageService } from "../interfaces";

/**
 * Slack implementation of IMessageService
 * Adapts the Slack Web API to our interface
 */
export class SlackMessageService implements IMessageService {
  constructor(private api: webApi.WebClient) {}

  async postMessage(channel: string, blocks: any[], text: string): Promise<string> {
    const response = await this.api.chat.postMessage({
      channel,
      blocks,
      text
    });
    
    return response.ts as string;
  }

  async updateMessage(channel: string, ts: string, blocks: any[], text: string): Promise<void> {
    await this.api.chat.update({
      channel,
      ts,
      blocks,
      text
    });
  }
}
