export type Role = 
  | 'good'
  | 'bad'
  | 'merlin'
  | 'percival'
  | 'morgana'
  | 'mordred'
  | 'oberon'
  | 'assassin';

export interface Player {
  id: string;
  role?: Role;
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
