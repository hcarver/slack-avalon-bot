import { Player, Role } from "../types";
import { GameConfiguration } from "../domain/GameConfiguration";

export class RoleService {
  private gameConfig: GameConfiguration;

  constructor(gameConfig: GameConfiguration) {
    this.gameConfig = gameConfig;
  }

  assignRoles(players: Player[]): { players: Player[]; evils: Player[]; assassin: Player } {
    const assigns = this.gameConfig.getRoleAssignments();
    const shuffledAssigns = this.shuffleRoles(assigns);
    
    const evils: Player[] = [];
    
    for (let i = 0; i < players.length; i++) {
      players[i].role = shuffledAssigns[i];
      if (players[i].isEvil()) {
        evils.push(players[i]);
      }
    }

    // Prefer to assign assassin to a generic evil player without special abilities
    const genericEvils = evils.filter(p => p.role === 'bad');
    const assassin = genericEvils.length > 0 
      ? genericEvils[Math.floor(Math.random() * genericEvils.length)]
      : evils[Math.floor(Math.random() * evils.length)];

    return { players, evils, assassin };
  }

  private shuffleRoles(assigns: Role[]): Role[] {
    const shuffled = [...assigns];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
