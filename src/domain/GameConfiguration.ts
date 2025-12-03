import { Role, QuestAssignment } from "../types";

export class GameConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameConfigurationError';
  }
}

/**
 * Immutable game configuration object
 * Encapsulates all game rules and validates configuration combinations
 */
export class GameConfiguration {
  readonly playerCount: number;
  readonly specialRoles: Role[];
  readonly resistance: boolean;
  readonly order: 'turn' | 'random';

  // Game constants
  static readonly MIN_PLAYERS = 5;
  static readonly MAX_PLAYERS = 10;
  
  static readonly QUEST_NAMES = ['first', 'second', 'third', 'fourth', 'fifth'];
  
  // Quest assignments per player count [n, f]
  // n = number of players on quest, f = number of fails required
  static readonly QUEST_ASSIGNMENTS: QuestAssignment[][] = [
    // 5 players
    [{ n: 2, f: 1 }, { n: 3, f: 1 }, { n: 2, f: 1 }, { n: 3, f: 1 }, { n: 3, f: 1 }],
    // 6 players
    [{ n: 2, f: 1 }, { n: 3, f: 1 }, { n: 4, f: 1 }, { n: 3, f: 1 }, { n: 4, f: 1 }],
    // 7 players
    [{ n: 2, f: 1 }, { n: 3, f: 1 }, { n: 3, f: 1 }, { n: 4, f: 2 }, { n: 4, f: 1 }],
    // 8 players
    [{ n: 3, f: 1 }, { n: 4, f: 1 }, { n: 4, f: 1 }, { n: 5, f: 2 }, { n: 5, f: 1 }],
    // 9 players
    [{ n: 3, f: 1 }, { n: 4, f: 1 }, { n: 4, f: 1 }, { n: 5, f: 2 }, { n: 5, f: 1 }],
    // 10 players
    [{ n: 3, f: 1 }, { n: 4, f: 1 }, { n: 4, f: 1 }, { n: 5, f: 2 }, { n: 5, f: 1 }],
  ];

  // Role assignments per player count
  static readonly ROLE_ASSIGNMENTS: Role[][] = [
    // 5 players: 3 good, 2 evil
    ['good', 'good', 'merlin', 'bad', 'assassin'],
    // 6 players: 4 good, 2 evil
    ['good', 'good', 'good', 'merlin', 'bad', 'assassin'],
    // 7 players: 4 good, 3 evil
    ['good', 'good', 'good', 'merlin', 'bad', 'bad', 'assassin'],
    // 8 players: 5 good, 3 evil
    ['good', 'good', 'good', 'good', 'merlin', 'bad', 'bad', 'assassin'],
    // 9 players: 6 good, 3 evil
    ['good', 'good', 'good', 'good', 'good', 'merlin', 'bad', 'bad', 'assassin'],
    // 10 players: 6 good, 4 evil
    ['good', 'good', 'good', 'good', 'good', 'merlin', 'bad', 'bad', 'bad', 'assassin'],
  ];

  constructor(
    playerCount: number,
    specialRoles: Role[] = ['merlin'],
    resistance: boolean = false,
    order: 'turn' | 'random' = 'turn'
  ) {
    this.playerCount = playerCount;
    this.specialRoles = specialRoles;
    this.resistance = resistance;
    this.order = order;
    
    this.validate();
  }

  private validate(): void {
    // Validate player count
    if (this.playerCount < GameConfiguration.MIN_PLAYERS || 
        this.playerCount > GameConfiguration.MAX_PLAYERS) {
      throw new GameConfigurationError(
        `Invalid player count: ${this.playerCount}. Must be ${GameConfiguration.MIN_PLAYERS}-${GameConfiguration.MAX_PLAYERS}`
      );
    }

    // Validate special roles
    const validSpecialRoles: Role[] = ['merlin', 'percival', 'morgana', 'mordred', 'oberon'];
    for (const role of this.specialRoles) {
      if (!validSpecialRoles.includes(role)) {
        throw new GameConfigurationError(`Invalid special role: ${role}`);
      }
    }

    // Validate role combinations
    const evilRoles = this.specialRoles.filter(r => ['morgana', 'mordred', 'oberon'].includes(r));
    const evilCount = this.getEvilCount();
    
    if (evilRoles.length > evilCount) {
      throw new GameConfigurationError(
        `Too many evil special roles (${evilRoles.length}) for ${this.playerCount} players. Maximum: ${evilCount}`
      );
    }

    // Merlin must be included unless it's resistance mode
    if (!this.resistance && !this.specialRoles.includes('merlin')) {
      throw new GameConfigurationError('Merlin must be included in Avalon mode');
    }

    // Percival requires Merlin or Morgana
    if (this.specialRoles.includes('percival')) {
      if (!this.specialRoles.includes('merlin') && !this.specialRoles.includes('morgana')) {
        throw new GameConfigurationError('Percival requires Merlin or Morgana to be in the game');
      }
    }
  }

  /**
   * Get quest assignments for this configuration
   */
  getQuestAssignments(): QuestAssignment[] {
    return GameConfiguration.QUEST_ASSIGNMENTS[this.playerCount - GameConfiguration.MIN_PLAYERS];
  }

  /**
   * Get base role assignments for this configuration
   */
  getRoleAssignments(): Role[] {
    const baseRoles = [...GameConfiguration.ROLE_ASSIGNMENTS[this.playerCount - GameConfiguration.MIN_PLAYERS]];
    
    // Replace base roles with special roles
    for (const specialRole of this.specialRoles) {
      if (specialRole === 'merlin') {
        // Merlin is already in base roles
        continue;
      }
      
      if (['morgana', 'mordred', 'oberon'].includes(specialRole)) {
        // Replace a 'bad' role
        const badIndex = baseRoles.indexOf('bad');
        if (badIndex >= 0) {
          baseRoles[badIndex] = specialRole;
        }
      } else if (specialRole === 'percival') {
        // Replace a 'good' role
        const goodIndex = baseRoles.indexOf('good');
        if (goodIndex >= 0) {
          baseRoles[goodIndex] = specialRole;
        }
      }
    }
    
    return baseRoles;
  }

  /**
   * Get the number of evil players
   */
  getEvilCount(): number {
    const baseRoles = GameConfiguration.ROLE_ASSIGNMENTS[this.playerCount - GameConfiguration.MIN_PLAYERS];
    return baseRoles.filter(r => !['good', 'merlin', 'percival'].includes(r)).length;
  }

  /**
   * Get the number of good players
   */
  getGoodCount(): number {
    return this.playerCount - this.getEvilCount();
  }

  /**
   * Create default configuration for a given player count
   */
  static createDefault(playerCount: number): GameConfiguration {
    return new GameConfiguration(playerCount, ['merlin'], false, 'turn');
  }

  /**
   * Create a copy with modified properties
   */
  withSpecialRoles(roles: Role[]): GameConfiguration {
    return new GameConfiguration(this.playerCount, roles, this.resistance, this.order);
  }

  withResistanceMode(resistance: boolean): GameConfiguration {
    return new GameConfiguration(this.playerCount, this.specialRoles, resistance, this.order);
  }

  withPlayerOrder(order: 'turn' | 'random'): GameConfiguration {
    return new GameConfiguration(this.playerCount, this.specialRoles, this.resistance, order);
  }
}
