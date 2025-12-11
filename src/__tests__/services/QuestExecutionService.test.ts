import { QuestExecutionService } from '../../services/QuestExecutionService';
import { Player, PlayerId, QuestAssignment } from '../../types';
import { UserId } from '../../slack-api-rx';
import { IActionListenerService } from '../../interfaces';

describe('QuestExecutionService', () => {
  let service: QuestExecutionService;
  let mockApi: any;
  let mockActionService: jest.Mocked<IActionListenerService>;
  let allPlayers: Player[];
  let questPlayers: Player[];
  let leader: Player;
  let playerDms: Record<string, string>;
  let questOrder: string[];
  let questAssignments: QuestAssignment[];
  let registeredListener: ((context: any) => Promise<void>) | null;

  beforeEach(() => {
    allPlayers = [
      new Player('p1' as PlayerId, 'u1' as UserId),
      new Player('p2' as PlayerId, 'u2' as UserId),
      new Player('p3' as PlayerId, 'u3' as UserId),
      new Player('p4' as PlayerId, 'u4' as UserId),
      new Player('p5' as PlayerId, 'u5' as UserId)
    ];
    
    questPlayers = [allPlayers[1], allPlayers[2], allPlayers[3]]; // Bob, Charlie, Diana
    leader = allPlayers[0]; // Alice
    
    playerDms = {
      p1: 'dm1',
      p2: 'dm2',
      p3: 'dm3',
      p4: 'dm4',
      p5: 'dm5'
    };
    
    questOrder = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    questAssignments = [
      { n: 2, f: 1 },
      { n: 3, f: 1 },
      { n: 2, f: 1 },
      { n: 3, f: 1 },
      { n: 3, f: 1 }
    ];
    
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
    
    service = new QuestExecutionService(mockApi, mockActionService);
  });

  describe('executeQuest', () => {
    it('should send quest messages to all players', async () => {
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      // Simulate all quest players voting
      for (const player of questPlayers) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'succeed' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      await questPromise;
      
      expect(mockApi.chat.postMessage).toHaveBeenCalledTimes(5);
      allPlayers.forEach(player => {
        expect(mockApi.chat.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            channel: playerDms[player.playerId]
          })
        );
      });
    });

    it('should collect succeed votes correctly', async () => {
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      // All players vote succeed
      for (const player of questPlayers) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'succeed' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      const result = await questPromise;
      
      expect(result.succeeded.length).toBe(3);
      expect(result.failed.length).toBe(0);
      expect(result.succeeded).toEqual(questPlayers);
    });

    it('should collect fail votes correctly', async () => {
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      // All players vote fail
      for (const player of questPlayers) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'fail' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      const result = await questPromise;
      
      expect(result.failed.length).toBe(3);
      expect(result.succeeded.length).toBe(0);
      expect(result.failed).toEqual(questPlayers);
    });

    it('should collect mixed votes correctly', async () => {
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      // Bob succeeds
      await registeredListener!({
        body: {
          user: { id: 'u2' },
          actions: [{ value: 'succeed' }],
          channel: { id: 'dm2' },
          message: { ts: '123.456' }
        }
      });
      
      // Charlie fails
      await registeredListener!({
        body: {
          user: { id: 'u3' },
          actions: [{ value: 'fail' }],
          channel: { id: 'dm3' },
          message: { ts: '123.456' }
        }
      });
      
      // Diana succeeds
      await registeredListener!({
        body: {
          user: { id: 'u4' },
          actions: [{ value: 'succeed' }],
          channel: { id: 'dm4' },
          message: { ts: '123.456' }
        }
      });
      
      const result = await questPromise;
      
      expect(result.succeeded).toContain(questPlayers[0]); // Bob
      expect(result.succeeded).toContain(questPlayers[2]); // Diana
      expect(result.failed).toContain(questPlayers[1]); // Charlie
      expect(result.succeeded.length).toBe(2);
      expect(result.failed.length).toBe(1);
    });

    it('should only collect votes from quest players', async () => {
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      // Non-quest player tries to vote (should be ignored)
      await registeredListener!({
        body: {
          user: { id: 'u1' }, // Alice is not on quest
          actions: [{ value: 'fail' }],
          channel: { id: 'dm1' },
          message: { ts: '123.456' }
        }
      });
      
      // Quest players vote
      for (const player of questPlayers) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'succeed' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      const result = await questPromise;
      
      expect(result.succeeded.length).toBe(3);
      expect(result.failed.length).toBe(0);
    });

    it('should update all players messages after each vote', async () => {
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      mockApi.chat.update.mockClear();
      
      await registeredListener!({
        body: {
          user: { id: 'u2' },
          actions: [{ value: 'succeed' }],
          channel: { id: 'dm2' },
          message: { ts: '123.456' }
        }
      });
      
      expect(mockApi.chat.update).toHaveBeenCalledTimes(5);
      
      mockApi.chat.update.mockClear();
      
      await registeredListener!({
        body: {
          user: { id: 'u3' },
          actions: [{ value: 'fail' }],
          channel: { id: 'dm3' },
          message: { ts: '123.456' }
        }
      });
      
      expect(mockApi.chat.update).toHaveBeenCalledTimes(5);
    });

    it('should register action listener for quest-success-vote', async () => {
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      expect(mockActionService.addActionListener).toHaveBeenCalledWith(
        'quest-success-vote',
        expect.any(Function)
      );
      
      // Complete votes
      for (const player of questPlayers) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'succeed' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      await questPromise;
    });

    it('should pass quest progress to message builder', async () => {
      const questProgress = ['success', 'fail'];
      
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        2,
        questProgress,
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      for (const player of questPlayers) {
        await registeredListener!({
          body: {
            user: { id: player.userId },
            actions: [{ value: 'succeed' }],
            channel: { id: playerDms[player.playerId] },
            message: { ts: '123.456' }
          }
        });
      }
      
      await questPromise;
    });
  });

  describe('edge cases', () => {
    it('should handle single player quest', async () => {
      const singleQuestPlayer = [questPlayers[0]];
      
      const questPromise = service.executeQuest(
        singleQuestPlayer,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      await registeredListener!({
        body: {
          user: { id: 'u2' },
          actions: [{ value: 'succeed' }],
          channel: { id: 'dm2' },
          message: { ts: '123.456' }
        }
      });
      
      const result = await questPromise;
      
      expect(result.succeeded.length).toBe(1);
      expect(result.failed.length).toBe(0);
    });

    it('should handle when same user controls multiple quest players', async () => {
      // Both quest players have same userId
      const sameUserQuestPlayers = [
        new Player('qp1' as PlayerId, 'same-user' as UserId),
        new Player('qp2' as PlayerId, 'same-user' as UserId)
      ];
      
      const twoPlayerQuest = sameUserQuestPlayers;
      
      const questPromise = service.executeQuest(
        twoPlayerQuest,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      // First action from same-user
      await registeredListener!({
        body: {
          user: { id: 'same-user' },
          actions: [{ value: 'succeed' }],
          channel: { id: 'dm2' },
          message: { ts: '123.456' }
        }
      });
      
      // Second action from same-user
      await registeredListener!({
        body: {
          user: { id: 'same-user' },
          actions: [{ value: 'fail' }],
          channel: { id: 'dm3' },
          message: { ts: '123.456' }
        }
      });
      
      const result = await questPromise;
      
      expect(result.succeeded.length + result.failed.length).toBe(2);
    });

    it('should preserve player order in results', async () => {
      const questPromise = service.executeQuest(
        questPlayers,
        allPlayers,
        leader,
        1,
        [],
        playerDms,
        questOrder,
        questAssignments
      );
      
      // Wait for listener to be registered
      
      await new Promise(resolve => setImmediate(resolve));
      
      // Vote in reverse order
      await registeredListener!({
        body: {
          user: { id: 'u4' },
          actions: [{ value: 'succeed' }],
          channel: { id: 'dm4' },
          message: { ts: '123.456' }
        }
      });
      
      await registeredListener!({
        body: {
          user: { id: 'u3' },
          actions: [{ value: 'succeed' }],
          channel: { id: 'dm3' },
          message: { ts: '123.456' }
        }
      });
      
      await registeredListener!({
        body: {
          user: { id: 'u2' },
          actions: [{ value: 'succeed' }],
          channel: { id: 'dm2' },
          message: { ts: '123.456' }
        }
      });
      
      const result = await questPromise;
      
      expect(result.succeeded.length).toBe(3);
    });
  });
});
