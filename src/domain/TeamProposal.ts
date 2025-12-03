import { Player } from "../types";

export class TeamProposal {
  readonly leader: Player;
  readonly members: Player[];
  readonly attemptNumber: number;
  readonly questNumber: number;

  constructor(
    leader: Player,
    members: Player[],
    questNumber: number,
    attemptNumber: number = 1
  ) {
    this.leader = leader;
    this.members = members;
    this.questNumber = questNumber;
    this.attemptNumber = attemptNumber;
  }

  getMemberIds(): string[] {
    return this.members.map(m => m.playerId);
  }

  includesPlayer(playerId: string): boolean {
    return this.members.some(m => m.playerId === playerId);
  }

  getTeamSize(): number {
    return this.members.length;
  }

  isLastAttempt(): boolean {
    return this.attemptNumber >= 5;
  }
}
