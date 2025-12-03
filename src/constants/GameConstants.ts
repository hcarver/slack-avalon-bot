import { Role } from "../types";

/**
 * Centralized game constants
 * All magic strings and display text in one place
 */
export class GameConstants {
  // Role display names with emoji
  static readonly ROLE_NAMES: Record<Role, string> = {
    bad: ":red_circle: Minion of Mordred",
    good: ":large_blue_circle: Loyal Servant of Arthur",
    assassin: ":crossed_swords: THE ASSASSIN :red_circle: Minion of Mordred",
    oberon: ":alien: OBERON :red_circle: Minion of Mordred: Unknown to the other Minions of Mordred",
    morgana: ":japanese_ogre: MORGANA :red_circle: Minion of Mordred. You pose as MERLIN",
    mordred: ":smiling_imp: MORDRED :red_circle: Unknown to MERLIN",
    percival: ":cop: PERCIVAL :large_blue_circle: Loyal Servant of Arthur",
    merlin: ":angel: MERLIN :large_blue_circle: Loyal Servant of Arthur",
  };

  // Short role names for UI
  static readonly ROLE_SHORT_NAMES: Record<Role, string> = {
    bad: "Minion",
    good: "Servant",
    assassin: "Assassin",
    oberon: "Oberon",
    morgana: "Morgana",
    mordred: "Mordred",
    percival: "Percival",
    merlin: "Merlin",
  };

  // Quest result emoji
  static readonly QUEST_RESULT_EMOJI = {
    good: ":large_blue_circle:",
    bad: ":red_circle:",
    current: ":black_circle:",
    pending: ":white_circle:",
  };

  // Team vote emoji
  static readonly VOTE_EMOJI = {
    approve: ":thumbsup:",
    reject: ":thumbsdown:",
  };

  // Quest action emoji
  static readonly QUEST_ACTION_EMOJI = {
    success: ":white_check_mark:",
    fail: ":x:",
  };

  // Win messages
  static readonly WIN_MESSAGES = {
    evilQuestWin: ":red_circle: Minions of Mordred win by failing 3 quests!",
    goodQuestWin: ":large_blue_circle: Loyal Servants of Arthur win by succeeding 3 quests!",
    evilAssassinWin: "Evil wins! Assassin killed Merlin!",
    goodAssassinWin: "Good wins! Assassin missed!",
    evilRejectionWin: ":red_circle: Minions of Mordred win! 5 teams rejected in a row!",
  };

  // Colors for Slack messages
  static readonly COLORS = {
    good: "#08e",
    evil: "#e00",
    neutral: "#999",
  };

  // Timing constants (milliseconds)
  static readonly TIMING = {
    betweenRounds: 1000,
    beforeQuest: 1000,
    beforeAssassination: 1000,
  };

  // Limits
  static readonly LIMITS = {
    maxRejections: 5,
    questsToWin: 3,
  };

  /**
   * Get role display name
   */
  static getRoleName(role: Role): string {
    return GameConstants.ROLE_NAMES[role] || role;
  }

  /**
   * Get short role name
   */
  static getRoleShortName(role: Role): string {
    return GameConstants.ROLE_SHORT_NAMES[role] || role;
  }

  /**
   * Get quest result emoji
   */
  static getQuestEmoji(result: "good" | "bad" | "current" | "pending"): string {
    return GameConstants.QUEST_RESULT_EMOJI[result];
  }

  /**
   * Get vote emoji
   */
  static getVoteEmoji(approved: boolean): string {
    return approved ? GameConstants.VOTE_EMOJI.approve : GameConstants.VOTE_EMOJI.reject;
  }

  /**
   * Get quest action emoji
   */
  static getQuestActionEmoji(success: boolean): string {
    return success ? GameConstants.QUEST_ACTION_EMOJI.success : GameConstants.QUEST_ACTION_EMOJI.fail;
  }
}
