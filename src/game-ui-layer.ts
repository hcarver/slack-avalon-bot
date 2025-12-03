import { App, CheckboxesAction, webApi } from "@slack/bolt";

export class GameUILayer {
  api: webApi.WebClient;
  app: App;

  constructor(api, app) {
    this.api = api;
    this.app = app;
  }

  async pollForDecision(
    channel_id,
    heading_text,
    options,
    verb,
    from_filter,
    minimum,
    maximum,
    validators=[]
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
            say(errors.join(" "))
            return;
          }

          say(`You chose ${selection.join(", ")}`);
          resolve(selected_indexes);
        }
      );

      const checkboxOptions = options.map(
        (option, idx) => {
          return {text: {type: "mrkdwn", text: option}, value: `${idx}`}
        }
      );

      this.api.chat.postMessage({
        channel: channel_id,
        blocks: [
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
        ]
      }).catch(err => {
        console.error('Error posting role selection message:', err);
      });

    });

    const result = await done;

    return result;
    } catch (err) {
      console.error('Error in pollForDecision:', err);
      throw err;
    }
  }
}