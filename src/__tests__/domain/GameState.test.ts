import { GameState } from '../../domain/GameState';
import { Player, PlayerId } from '../../types';
import { UserId } from '../../slack-api-rx';
import { GamePhase } from '../../domain/GamePhaseManager';

describe('GameState', () => {
  let players: Player[];
  let playerDms: Record<string, string>;
  let evils: Player[];
  let gameState: GameState;

  beforeEach(() => {
    players = [
      new Player('p1' as PlayerId, 'u1' as UserId),
      new Player('p2' as PlayerId, 'u2' as UserId),
      new Player('p3' as PlayerId, 'u3' as UserId),
      new Player('p4' as PlayerId, 'u4' as UserId),
      new Player('p5' as PlayerId, 'u5' as UserId)
    ];
    playerDms = {
      p1: 'dm1',
      p2: 'dm2',
      p3: 'dm3',
      p4: 'dm4',
      p5: 'dm5'
    };
    evils = [players[1], players[4]];
    
    gameState = new GameState(
      players,
      playerDms,
      { id: 'channel1' },
      false,
      ['merlin', 'assassin'],
      evils,
      players[1]
    );
  });

  describe('initialization', () => {
    it('should initialize with correct player data', () => {
      expect(gameState.players).toBe(players);
      expect(gameState.getPlayerCount()).toBe(5);
      expect(gameState.playerDms).toBe(playerDms);
    });

    it('should initialize with correct evil and good counts', () => {
      expect(gameState.getEvilCount()).toBe(2);
      expect(gameState.getGoodCount()).toBe(3);
    });

    it('should initialize with correct assassin', () => {
      expect(gameState.assassin).toBe(players[1]);
    });

    it('should start with rejectCount at 0', () => {
      expect(gameState.rejectCount).toBe(0);
    });

    it('should start with leader at index 0', () => {
      expect(gameState.currentLeaderIndex).toBe(0);
      expect(gameState.getCurrentLeader()).toBe(players[0]);
    });

    it('should start with empty quest players', () => {
      expect(gameState.questPlayers).toEqual([]);
    });

    it('should start in running state', () => {
      expect(gameState.isRunning).toBe(true);
    });

    it('should start in SETUP phase', () => {
      expect(gameState.getCurrentPhase()).toBe(GamePhase.NOT_STARTED);
    });
  });

  describe('leader management', () => {
    it('should get current leader correctly', () => {
      expect(gameState.getCurrentLeader()).toBe(players[0]);
    });

    it('should advance leader to next player', () => {
      gameState.advanceLeader();
      expect(gameState.getCurrentLeader()).toBe(players[1]);
      expect(gameState.currentLeaderIndex).toBe(1);
    });

    it('should wrap leader around to first player after last', () => {
      gameState.currentLeaderIndex = 4;
      gameState.advanceLeader();
      expect(gameState.getCurrentLeader()).toBe(players[0]);
      expect(gameState.currentLeaderIndex).toBe(0);
    });

    it('should cycle through all players correctly', () => {
      for (let i = 0; i < 5; i++) {
        expect(gameState.getCurrentLeader()).toBe(players[i]);
        gameState.advanceLeader();
      }
      expect(gameState.getCurrentLeader()).toBe(players[0]);
    });
  });

  describe('reject count management', () => {
    it('should increment reject count', () => {
      gameState.incrementRejectCount();
      expect(gameState.rejectCount).toBe(1);
    });

    it('should increment multiple times', () => {
      gameState.incrementRejectCount();
      gameState.incrementRejectCount();
      gameState.incrementRejectCount();
      expect(gameState.rejectCount).toBe(3);
    });

    it('should reset reject count to 0', () => {
      gameState.incrementRejectCount();
      gameState.incrementRejectCount();
      gameState.resetRejectCount();
      expect(gameState.rejectCount).toBe(0);
    });
  });

  describe('quest player management', () => {
    it('should set quest players', () => {
      const questPlayers = [players[0], players[2]];
      gameState.setQuestPlayers(questPlayers);
      expect(gameState.questPlayers).toBe(questPlayers);
    });

    it('should replace previous quest players', () => {
      gameState.setQuestPlayers([players[0]]);
      gameState.setQuestPlayers([players[1], players[2]]);
      expect(gameState.questPlayers).toEqual([players[1], players[2]]);
    });
  });

  describe('game state management', () => {
    it('should not be ended initially', () => {
      expect(gameState.isGameEnded()).toBe(false);
    });

    it('should end game when endGame is called', () => {
      gameState.endGame();
      expect(gameState.isRunning).toBe(false);
      expect(gameState.isGameEnded()).toBe(true);
    });
  });

  describe('phase management', () => {
    it('should start in NOT_STARTED phase', () => {
      expect(gameState.isInPhase(GamePhase.NOT_STARTED)).toBe(true);
    });

    it('should transition to ROLE_ASSIGNMENT then TEAM_SELECTION phase', () => {
      gameState.transitionToPhase(GamePhase.ROLE_ASSIGNMENT);
      gameState.transitionToPhase(GamePhase.TEAM_SELECTION);
      expect(gameState.getCurrentPhase()).toBe(GamePhase.TEAM_SELECTION);
      expect(gameState.isInPhase(GamePhase.TEAM_SELECTION)).toBe(true);
    });

    it('should transition through multiple phases', () => {
      gameState.transitionToPhase(GamePhase.ROLE_ASSIGNMENT);
      gameState.transitionToPhase(GamePhase.TEAM_SELECTION);
      gameState.transitionToPhase(GamePhase.TEAM_VOTING);
      gameState.transitionToPhase(GamePhase.QUEST_EXECUTION);
      expect(gameState.getCurrentPhase()).toBe(GamePhase.QUEST_EXECUTION);
    });

    it('should check if can transition to valid next phase', () => {
      expect(gameState.canTransitionTo(GamePhase.ROLE_ASSIGNMENT)).toBe(true);
      expect(gameState.canTransitionTo(GamePhase.TEAM_SELECTION)).toBe(false);
    });
  });
});
