// see https://api.slack.com/reference/interaction-payloads/block-actions
// this is a subset of the data present there
export type ActionPayload = {
  type: "block_actions";
  user: {
    id: string;
    username: string;
  };
  actions: {
    block_id: string;
    action_id: string;
    value: string;
    action_ts: string;
    type:
      | "button"
      | "checkboxes"
      | "radio"
      | "datepicker"
      | "overflow"
      | "plain_text_input"
      | "rich_text_input"
      | "multi_*_select"
      | "*_select";
  }[];
  channel: {
    id: string;
    name: string;
  };
};
