import { UserId } from './slack-api-rx';

export type PlayerId = string & { readonly __brand: 'PlayerId' };

export type Role = 
  | 'good'
  | 'bad'
  | 'merlin'
  | 'percival'
  | 'morgana'
  | 'mordred'
  | 'oberon'
  | 'assassin';

export class Player {
  constructor(
    public readonly playerId: PlayerId,  // Unique game identifier (generated)
    public readonly userId: UserId,      // Slack user ID
    public role?: Role
  ) {}

  isEvil(): boolean {
    return this.role !== undefined && 
           !['good', 'merlin', 'percival'].includes(this.role);
  }

  isGood(): boolean {
    return !this.isEvil();
  }

  canFailQuests(): boolean {
    return this.isEvil();
  }

  isKnownToOtherEvils(): boolean {
    return this.isEvil() && this.role !== 'oberon';
  }

  isVisibleToMerlin(): boolean {
    return this.isEvil() && this.role !== 'mordred';
  }

  hasRole(): boolean {
    return this.role !== undefined;
  }

  /**
   * Create a player from a user ID
   * Generates a unique player ID for this game instance
   */
  static fromUserId(userId: UserId): Player {
    const playerId = `player_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` as PlayerId;
    return new Player(playerId, userId);
  }

  /**
   * Create multiple players from user IDs
   */
  static fromUserIds(userIds: UserId[]): Player[] {
    return userIds.map(userId => Player.fromUserId(userId));
  }

  /**
   * @deprecated Use fromUserId instead
   */
  static fromId(id: string): Player {
    return Player.fromUserId(id as UserId);
  }

  /**
   * @deprecated Use fromUserIds instead
   */
  static fromIds(ids: string[]): Player[] {
    return Player.fromUserIds(ids as UserId[]);
  }
}

export interface QuestAssignment {
  n: number; // Number of players required
  f: number; // Number of fails required
}

export interface GameConfig {
  resistance: boolean;
  order: string;
  specialRoles: Role[];
}

export interface VoteResult {
  player: Player;
  approve?: boolean;
  fail?: boolean;
}

export interface GameScore {
  good: number;
  bad: number;
}

export type QuestResult = 'good' | 'bad';

export type QuestPhase = 'Team Selection' | 'Team Voting' | 'Quest';

export { TeamProposal } from './domain/TeamProposal';
export { GameState } from './domain/GameState';
