import { Player, Role } from "../types";
import { GamePhaseManager, GamePhase } from "./GamePhaseManager";

export class GameState {
  readonly players: Player[];
  readonly playerDms: Record<string, string>;
  readonly channel: any;
  readonly date: Date;
  readonly resistance: boolean;
  readonly specialRoles: Role[];
  
  readonly evils: Player[];
  readonly assassin: Player;
  
  rejectCount: number;
  currentLeaderIndex: number;
  questPlayers: Player[];
  isRunning: boolean;
  private phaseManager: GamePhaseManager;

  constructor(
    players: Player[],
    playerDms: Record<string, string>,
    channel: any,
    resistance: boolean,
    specialRoles: Role[],
    evils: Player[],
    assassin: Player
  ) {
    this.players = players;
    this.playerDms = playerDms;
    this.channel = channel;
    this.date = new Date();
    this.resistance = resistance;
    this.specialRoles = specialRoles;
    this.evils = evils;
    this.assassin = assassin;
    
    this.rejectCount = 0;
    this.currentLeaderIndex = 0;
    this.questPlayers = [];
    this.isRunning = true;
    this.phaseManager = new GamePhaseManager();
  }

  getCurrentLeader(): Player {
    return this.players[this.currentLeaderIndex];
  }

  advanceLeader(): void {
    this.currentLeaderIndex = (this.currentLeaderIndex + 1) % this.players.length;
  }

  incrementRejectCount(): void {
    this.rejectCount++;
  }

  resetRejectCount(): void {
    this.rejectCount = 0;
  }

  setQuestPlayers(players: Player[]): void {
    this.questPlayers = players;
  }

  isGameEnded(): boolean {
    return this.phaseManager.hasEnded();
  }

  endGame(): void {
    this.phaseManager.forceEnd();
    this.isRunning = false;
  }

  getPlayerCount(): number {
    return this.players.length;
  }

  getEvilCount(): number {
    return this.evils.length;
  }

  getGoodCount(): number {
    return this.players.length - this.evils.length;
  }

  // Phase management methods
  getCurrentPhase(): GamePhase {
    return this.phaseManager.getCurrentPhase();
  }

  transitionToPhase(phase: GamePhase): void {
    this.phaseManager.transitionTo(phase);
  }

  isInPhase(phase: GamePhase): boolean {
    return this.phaseManager.isInPhase(phase);
  }

  canTransitionTo(phase: GamePhase): boolean {
    return this.phaseManager.canTransitionTo(phase);
  }
}

