const M = require("./message-helpers");

export class RoleManager {
  static getRoleEmoji(role: string): string {
    const emojiMap = {
      'merlin': '👼',
      'percival': '👮',
      'morgana': '👹',
      'mordred': '😈',
      'oberon': '👽',
      'assassin': '⚔️',
      'bad': '🔴',
      'good': '🔵'
    };
    return emojiMap[role] || '❓';
  }

  static getRoleName(role: string): string {
    const nameMap = {
      'merlin': 'MERLIN',
      'percival': 'PERCIVAL',
      'morgana': 'MORGANA',
      'mordred': 'MORDRED',
      'oberon': 'OBERON',
      'assassin': 'THE ASSASSIN',
      'bad': 'a Minion of Mordred',
      'good': 'a Loyal Servant of Arthur'
    };
    return nameMap[role] || role;
  }

  static getRoleSpecificInfo(player, allPlayers, evils, knownEvils): string {
    if (player.role === "merlin") {
      let evilButMordred = evils.filter((p) => p.role !== "mordred");
      if (evilButMordred.length === evils.length) {
        return `You see all evil players:\n${M.pp(evils)}`;
      } else {
        return `You see these evil players:\n${M.pp(evilButMordred)}\n\n⚠️ MORDRED is hidden from you!`;
      }
    } else if (player.role === "percival") {
      let merlins = allPlayers.filter(
        (p) => p.role === "morgana" || p.role === "merlin"
      );

      if (merlins.length === 1) {
        return `${M.formatAtUser(merlins[0].id)} is MERLIN`;
      } else if (merlins.length > 1) {
        return `One of these is MERLIN, the other is MORGANA:\n${M.pp(merlins)}`;
      }
    } else if (player.role !== "good" && player.role !== "oberon") {
      if (knownEvils.length === evils.length) {
        return `Your evil teammates:\n${M.pp(knownEvils)}`;
      } else {
        return `Your known evil teammates:\n${M.pp(knownEvils)}\n\n⚠️ OBERON is unknown to you!`;
      }
    }
    return "";
  }

  static getRoleObjective(role: string): string {
    const objectives = {
      'merlin': 'Use your knowledge wisely, but don\'t reveal yourself or the Assassin will kill you!',
      'percival': 'Protect Merlin\'s identity while helping good prevail.',
      'morgana': 'Pretend to be Merlin to confuse Percival.',
      'mordred': 'You are hidden from Merlin. Use this to your advantage!',
      'oberon': 'You work alone. Sow chaos without revealing yourself to other evil players.',
      'assassin': 'Sabotage quests and identify Merlin for the final kill.',
      'bad': 'Sabotage quests to make them fail. Work with your evil teammates.',
      'good': 'Choose teams wisely and make quests succeed!'
    };
    return objectives[role] || '';
  }

  static isGoodPlayer(role: string): boolean {
    return ['good', 'merlin', 'percival'].includes(role);
  }

  static isEvilPlayer(role: string): boolean {
    return !this.isGoodPlayer(role);
  }
}
