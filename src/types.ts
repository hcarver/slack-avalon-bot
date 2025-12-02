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
    public readonly id: string,
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

  static fromId(id: string): Player {
    return new Player(id);
  }

  static fromIds(ids: string[]): Player[] {
    return ids.map(id => Player.fromId(id));
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
