"use strict";
const fs = require("fs");
const bodyParser = require("body-parser");
const Bot = require("./bot");

const pathToken = process.env.SLACK_AVALON_BOT_TOKEN;
let token;
try {
  token = pathToken || fs.readFileSync("token.txt", "utf8").trim();
} catch (error) {
  console.log(
    "Your API token should be placed in a 'token.txt' file, which is missing.",
  );
  process.exit(1);
}

const bot = new Bot(token);
bot.login();
