import { TeamVotingService } from '../../services/TeamVotingService';
import { TeamProposal } from '../../domain/TeamProposal';
import { Player, PlayerId } from '../../types';
import { UserId } from '../../slack-api-rx';
import { IActionListenerService } from '../../interfaces';

describe('TeamVotingService', () => {
  let service: TeamVotingService;
  let mockApi: any;
  let mockActionService: jest.Mocked<IActionListenerService>;
  let players: Player[];
  let playerDms: Record<string, string>;
  let proposal: TeamProposal;
  let questOrder: string[];
  let registeredListener: ((context: any) => Promise<void>) | null;

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
    
    proposal = new TeamProposal(players[0], [players[1], players[2]], 0, 1);
    questOrder = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    
    mockApi = {
      chat: {
        postMessage: jest.fn().mockResolvedValue({ ts: '123.456' }),
        update: jest.fn().mockResolvedValue({})
      }
    };
    
    registeredListener = null;
    mockActionService = {
      addActionListener: jest.fn((blockId, listener) => {
        registeredListener = listener;
        return 'listener-123';
      }),
      removeActionListener: jest.fn()
    };
    
    service = new TeamVotingService(mockApi, mockActionService);
  });

  describe('voteOnTeam', () => {
    it('should send vote messages to all players', async () => {
      const votePromise = service.voteOnTeam(proposal, players, playerDms, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate all votes
      for (const player of players) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'approve' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      await votePromise;
      
      expect(mockApi.chat.postMessage).toHaveBeenCalledTimes(5);
      players.forEach(player => {
        expect(mockApi.chat.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: playerDms[player.playerId],
            text: 'Team vote for First quest'
          })
        );
      });
    });

    it('should return true when majority approves', async () => {
      const votePromise = service.voteOnTeam(proposal, players, playerDms, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      // 3 approve, 2 reject
      for (let i = 0; i < 5; i++) {
        const vote = i < 3 ? 'approve' : 'reject';
        await registeredListener!({
          body: {
            user: { id: players[i].userId },
            actions: [{ value: vote }],
            channel: { id: playerDms[players[i].playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      const result = await votePromise;
      expect(result).toBe(true); // 3 approve > 2 reject
    });

    it('should return false when majority rejects', async () => {
      const votePromise = service.voteOnTeam(proposal, players, playerDms, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      // 2 approve, 3 reject
      for (let i = 0; i < 5; i++) {
        const vote = i < 2 ? 'approve' : 'reject';
        await registeredListener!({
          body: {
            user: { id: players[i].userId },
            actions: [{ value: vote }],
            channel: { id: playerDms[players[i].playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      const result = await votePromise;
      expect(result).toBe(false); // 2 approve < 3 reject
    });

    it('should return false on tie vote', async () => {
      const fourPlayers = players.slice(0, 4);
      const fourPlayerDms = {
        p1: 'dm1',
        p2: 'dm2',
        p3: 'dm3',
        p4: 'dm4'
      };
      
      const votePromise = service.voteOnTeam(proposal, fourPlayers, fourPlayerDms, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      // 2 approve, 2 reject (tie)
      for (let i = 0; i < 4; i++) {
        const vote = i < 2 ? 'approve' : 'reject';
        await registeredListener!({
          body: {
            user: { id: fourPlayers[i].userId },
            actions: [{ value: vote }],
            channel: { id: fourPlayerDms[fourPlayers[i].playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      const result = await votePromise;
      expect(result).toBe(false); // Ties fail
    });

    it('should update all players messages after each vote', async () => {
      const votePromise = service.voteOnTeam(proposal, players, playerDms, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      mockApi.chat.update.mockClear();
      
      // Cast first vote
      await registeredListener!({
        body: {
          user: { id: players[0].userId },
          actions: [{ value: 'approve' }],
          channel: { id: playerDms[players[0].playerId] },
          message: { ts: '123.456' }
        }
      });
      
      expect(mockApi.chat.update).toHaveBeenCalledTimes(5);
      
      // Complete remaining votes
      for (let i = 1; i < 5; i++) {
        await registeredListener!({
          body: {
            user: { id: players[i].userId },
            actions: [{ value: 'approve' }],
            channel: { id: playerDms[players[i].playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      await votePromise;
    });

    it('should update to history view after all votes', async () => {
      const votePromise = service.voteOnTeam(proposal, players, playerDms, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      mockApi.chat.update.mockClear();
      
      // All players vote
      for (const player of players) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'approve' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      await votePromise;
      
      // Should have final history update for all 5 players
      const finalCalls = mockApi.chat.update.mock.calls.slice(-5);
      expect(finalCalls.length).toBe(5);
      finalCalls.forEach((call: any) => {
        expect(call[0].text).toBe('Team vote result for First quest');
      });
    });

    it('should register action listener for quest-team-vote', async () => {
      service.voteOnTeam(proposal, players, playerDms, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockActionService.addActionListener).toHaveBeenCalledWith(
        'quest-team-vote',
        expect.any(Function)
      );
    });
  });

  describe('edge cases', () => {
    it('should handle single player voting (all approve)', async () => {
      const singlePlayer = [players[0]];
      const singleDm = { p1: 'dm1' };
      
      const votePromise = service.voteOnTeam(proposal, singlePlayer, singleDm, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      await registeredListener!({
        body: {
          user: { id: players[0].userId },
          actions: [{ value: 'approve' }],
          channel: { id: 'dm1' },
          message: { ts: '123.456' }
        }
      });
      
      const result = await votePromise;
      expect(result).toBe(true); // 1 approve > 0 reject
    });

    it('should handle single player voting (reject)', async () => {
      const singlePlayer = [players[0]];
      const singleDm = { p1: 'dm1' };
      
      const votePromise = service.voteOnTeam(proposal, singlePlayer, singleDm, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      await registeredListener!({
        body: {
          user: { id: players[0].userId },
          actions: [{ value: 'reject' }],
          channel: { id: 'dm1' },
          message: { ts: '123.456' }
        }
      });
      
      const result = await votePromise;
      expect(result).toBe(false); // 0 approve < 1 reject
    });

    it('should use correct quest name from questOrder', async () => {
      const thirdQuestProposal = new TeamProposal(players[0], [players[1]], 2, 1);
      
      const votePromise = service.voteOnTeam(thirdQuestProposal, players, playerDms, questOrder);
      
      // Wait for listener to be registered
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockApi.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Team vote for Third quest'
        })
      );
      
      // Complete votes to avoid hanging
      for (const player of players) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'approve' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      await votePromise;
    });
  });
});
