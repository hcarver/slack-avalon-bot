import { App, CheckboxesAction, webApi } from "@slack/bolt";

export class GameUILayer {
  api: webApi.WebClient;
  app: App;
  choiceContexts?: Map<string, { messageTs: string; blocks: any[] }>;

  constructor(api, app) {
    this.api = api;
    this.app = app;
  }

  /**
   * Register action listeners for a choice and return action IDs
   * Returns: { checkboxId, submitId, promise }
   */
  registerChoiceActions(
    channel_id: string,
    options: string[],
    from_filter: (user_id: string) => boolean,
    minimum: number,
    maximum: number,
    validators: Array<(selected: number[]) => string | null> = [],
    messageTs?: string,
    baseBlocks?: any[]
  ): { checkboxId: string; submitId: string; promise: Promise<number[]> } {
    const checkbox_id = `${(Math.random() + 1).toString(36)}`;
    const submit_id = `${(Math.random() + 1).toString(36)}`;
    let selected_options: string[] = [];

    this.app.action(
      { action_id: checkbox_id },
      async (request) => {
        request.ack();
        selected_options = (request.action as CheckboxesAction).selected_options.map(x => x.value);
      }
    );

    const done = new Promise<number[]>((resolve) => {
      this.app.action(
        { action_id: submit_id },
        async (request) => {
          const { ack } = request;
          ack();

          const errors: string[] = [];

          if (selected_options.length < minimum || selected_options.length > maximum) {
            if (minimum != maximum) {
              errors.push(`Choose between ${minimum} and ${maximum} options`);
            } else {
              errors.push(`Choose ${minimum} options`);
            }
          }

          const selected_indexes = selected_options.map(x => parseInt(x, 10));

          for (let validator of validators) {
            const result = validator(selected_indexes);
            if (result) {
              errors.push(result);
            }
          }

          if (errors.length > 0) {
            // Try to get context for this submit ID
            const context = this.choiceContexts?.get(submit_id);
            
            if (context) {
              // Update message with error block
              const errorBlock = {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `❌ *Error:* ${errors.join(" ")}`
                }
              };
              
              await this.api.chat.update({
                channel: channel_id,
                ts: context.messageTs,
                blocks: [...context.blocks, errorBlock],
                text: errors.join(" ")
              });
            } else if (messageTs && baseBlocks) {
              // Fallback: use passed-in parameters
              const errorBlock = {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `❌ *Error:* ${errors.join(" ")}`
                }
              };
              
              await this.api.chat.update({
                channel: channel_id,
                ts: messageTs,
                blocks: [...baseBlocks, errorBlock],
                text: errors.join(" ")
              });
            } else {
              // Last resort: post as separate message
              await this.api.chat.postMessage({
                channel: channel_id,
                text: errors.join(" ")
              });
            }
            return;
          }

          resolve(selected_indexes);
        }
      );
    });

    return { checkboxId: checkbox_id, submitId: submit_id, promise: done };
  }

  /**
   * Update the context (message timestamp and blocks) for an already-registered choice action
   * This allows error messages to update the correct message with correct blocks
   */
  updateChoiceActionsContext(submitId: string, messageTs: string, blocks: any[]): void {
    // Store in a map keyed by submit ID
    if (!this.choiceContexts) {
      this.choiceContexts = new Map();
    }
    this.choiceContexts.set(submitId, { messageTs, blocks });
  }

  async pollForDecision(
    channel_id,
    heading_text,
    options,
    verb,
    from_filter,
    minimum,
    maximum,
    validators=[],
    existingMessageTs?: string,
    existingBlocks?: any[]
  ) {
    try {
      const checkbox_id = `${(Math.random() + 1).toString(36)}`;
      const submit_id = `${(Math.random() + 1).toString(36)}`;
      let selected_options = []

    this.app.action(
      { action_id: checkbox_id },
      async (request) => {
        request.ack();
        selected_options = (request.action as CheckboxesAction).selected_options.map(x => x.value)
      }
    );

    const done = new Promise((resolve) => {
      this.app.action(
        { action_id: submit_id},
        async (request) => {
          const {body, client, ack, logger, payload} = request;
          const say = (request as any).say;
          ack();

          const errors = []

          if(selected_options.length < minimum ||
             selected_options.length > maximum){
            if(minimum != maximum) {
              errors.push(`Choose between ${minimum} and ${maximum} options`);
            }
            else {
              errors.push(`Choose ${minimum} options`);
            }
          }

          const selected_indexes = selected_options.map(x => parseInt(x, 10));
          const selection = selected_indexes.map((idx) => options[idx as number]);

          for(let validator of validators) {
            const result = validator(selected_indexes)
            if(result) {
              errors.push(result)
            }
          }

          if(errors.length > 0) {
            // For validation errors, use say() if no existing message, otherwise update the message
            if (existingMessageTs) {
              await this.api.chat.postMessage({
                channel: channel_id,
                text: errors.join(" "),
                thread_ts: existingMessageTs
              });
            } else {
              say(errors.join(" "));
            }
            return;
          }

          // Don't send "You chose X" message - let the caller handle it
          resolve(selected_indexes);
        }
      );

      const checkboxOptions = options.map(
        (option, idx) => {
          return {text: {type: "mrkdwn", text: option}, value: `${idx}`}
        }
      );

      const interactiveBlocks = [
        { type: "header", text: { type: "plain_text", text: heading_text } },
        { type: "actions",
          elements: [
            { type: "checkboxes",
              action_id: checkbox_id,
              options: checkboxOptions
            }
          ]
        },
        { type: "actions",
          elements: [
            { type: "button",
              action_id: submit_id,
              text: {type: "plain_text", text: verb}
            }
          ]
        }
      ];

      // Combine existing blocks with interactive blocks if provided
      const blocks = existingBlocks 
        ? [...existingBlocks, { type: 'divider' }, ...interactiveBlocks]
        : interactiveBlocks;

      if (existingMessageTs) {
        // Update existing message
        this.api.chat.update({
          channel: channel_id,
          ts: existingMessageTs,
          blocks,
          text: heading_text
        }).catch(err => {
          console.error('Error updating choice message:', err);
        });
      } else {
        // Create new message
        this.api.chat.postMessage({
          channel: channel_id,
          blocks,
          text: heading_text
        }).catch(err => {
          console.error('Error posting choice message:', err);
        });
      }

    });

    const result = await done;

    return result;
    } catch (err) {
      console.error('Error in pollForDecision:', err);
      throw err;
    }
  }
}