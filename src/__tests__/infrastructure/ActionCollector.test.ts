import { ActionCollector } from '../../services/ActionCollector';
import { IActionListenerService } from '../../interfaces';

describe('ActionCollector', () => {
  let mockActionService: jest.Mocked<IActionListenerService>;
  let collector: ActionCollector<string>;
  let playerIds: string[];
  let mockListener: (context: any) => Promise<void>;

  beforeEach(() => {
    mockActionService = {
      addActionListener: jest.fn((blockId, listener) => {
        mockListener = listener;
        return 'listener-id-123';
      }),
      removeActionListener: jest.fn()
    };
    
    playerIds = ['p1', 'p2', 'p3'];
  });

  describe('initialization', () => {
    it('should create promises for all players', () => {
      collector = new ActionCollector(mockActionService, 'test-block', playerIds);
      
      expect(collector.getPending()).toEqual(['p1', 'p2', 'p3']);
      expect(collector.getCompleted()).toEqual([]);
    });

    it('should handle empty player list', () => {
      collector = new ActionCollector(mockActionService, 'test-block', []);
      
      expect(collector.getPending()).toEqual([]);
      expect(collector.getCompleted()).toEqual([]);
    });
  });

  describe('start and action handling', () => {
    beforeEach(() => {
      collector = new ActionCollector(mockActionService, 'test-block', playerIds);
    });

    it('should register action listener when start is called', () => {
      const handler = jest.fn().mockReturnValue('result');
      
      collector.start(handler);
      
      expect(mockActionService.addActionListener).toHaveBeenCalledWith('test-block', expect.any(Function));
    });

    it('should call handler when action is triggered', async () => {
      const handler = jest.fn().mockReturnValue('vote-yes');
      collector.start(handler);
      
      const actionContext = {
        body: {
          user: { id: 'p1' },
          actions: [{ value: 'approve' }],
          channel: { id: 'ch1' },
          message: { ts: '1234567.89' }
        }
      };
      
      await mockListener(actionContext);
      
      expect(handler).toHaveBeenCalledWith('p1', 'approve');
    });

    it('should mark player as completed after action', async () => {
      const handler = jest.fn().mockReturnValue('result');
      collector.start(handler);
      
      const actionContext = {
        body: {
          user: { id: 'p1' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '1234567.89' }
        }
      };
      
      await mockListener(actionContext);
      
      expect(collector.hasCompleted('p1')).toBe(true);
      expect(collector.getCompleted()).toEqual(['p1']);
      expect(collector.getPending()).toEqual(['p2', 'p3']);
    });

    it('should ignore action if handler returns null', async () => {
      const handler = jest.fn().mockReturnValue(null);
      collector.start(handler);
      
      const actionContext = {
        body: {
          user: { id: 'p1' },
          actions: [{ value: 'invalid' }],
          channel: { id: 'ch1' },
          message: { ts: '1234567.89' }
        }
      };
      
      await mockListener(actionContext);
      
      expect(collector.hasCompleted('p1')).toBe(false);
      expect(collector.getCompleted()).toEqual([]);
    });

    it('should ignore action from unknown player', async () => {
      const handler = jest.fn().mockReturnValue('result');
      collector.start(handler);
      
      const actionContext = {
        body: {
          user: { id: 'unknown-player' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '1234567.89' }
        }
      };
      
      await mockListener(actionContext);
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should ignore action from already completed player', async () => {
      const handler = jest.fn().mockReturnValue('result');
      collector.start(handler);
      
      const actionContext = {
        body: {
          user: { id: 'p1' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '1234567.89' }
        }
      };
      
      await mockListener(actionContext);
      expect(handler).toHaveBeenCalledTimes(1);
      
      await mockListener(actionContext);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('onUpdate callback', () => {
    it('should call onUpdate callback after action', async () => {
      collector = new ActionCollector(mockActionService, 'test-block', playerIds);
      const handler = jest.fn().mockReturnValue('result');
      const onUpdate = jest.fn();
      
      collector.start(handler, onUpdate);
      
      const actionContext = {
        body: {
          user: { id: 'p1' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '1234567.89' }
        }
      };
      
      await mockListener(actionContext);
      
      expect(onUpdate).toHaveBeenCalledWith('ch1', '1234567.89', 'p1');
    });

    it('should not call onUpdate if channel or ts missing', async () => {
      collector = new ActionCollector(mockActionService, 'test-block', playerIds);
      const handler = jest.fn().mockReturnValue('result');
      const onUpdate = jest.fn();
      
      collector.start(handler, onUpdate);
      
      const actionContext = {
        body: {
          user: { id: 'p1' },
          actions: [{ value: 'yes' }]
        }
      };
      
      await mockListener(actionContext);
      
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('waitForAll', () => {
    it('should resolve when all players complete', async () => {
      collector = new ActionCollector(mockActionService, 'test-block', playerIds);
      const handler = jest.fn((playerId, value) => `${playerId}-${value}`);
      
      collector.start(handler);
      
      const promise = collector.waitForAll();
      
      await mockListener({
        body: {
          user: { id: 'p1' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '123' }
        }
      });
      
      await mockListener({
        body: {
          user: { id: 'p2' },
          actions: [{ value: 'no' }],
          channel: { id: 'ch1' },
          message: { ts: '123' }
        }
      });
      
      await mockListener({
        body: {
          user: { id: 'p3' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '123' }
        }
      });
      
      const results = await promise;
      
      expect(results).toEqual(['p1-yes', 'p2-no', 'p3-yes']);
    });

    it('should cleanup listener after completion', async () => {
      collector = new ActionCollector(mockActionService, 'test-block', playerIds);
      const handler = jest.fn().mockReturnValue('result');
      
      collector.start(handler);
      const promise = collector.waitForAll();
      
      for (const playerId of playerIds) {
        await mockListener({
          body: {
            user: { id: playerId },
            actions: [{ value: 'yes' }],
            channel: { id: 'ch1' },
            message: { ts: '123' }
          }
        });
      }
      
      await promise;
      
      expect(mockActionService.removeActionListener).toHaveBeenCalledWith('listener-id-123');
    });
  });

  describe('waitFor specific players', () => {
    it('should resolve when specified players complete', async () => {
      collector = new ActionCollector(mockActionService, 'test-block', playerIds);
      const handler = jest.fn((playerId, value) => `${playerId}-${value}`);
      
      collector.start(handler);
      
      const promise = collector.waitFor(['p1', 'p3']);
      
      await mockListener({
        body: {
          user: { id: 'p1' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '123' }
        }
      });
      
      await mockListener({
        body: {
          user: { id: 'p3' },
          actions: [{ value: 'no' }],
          channel: { id: 'ch1' },
          message: { ts: '123' }
        }
      });
      
      const results = await promise;
      
      expect(results).toEqual(['p1-yes', 'p3-no']);
    });
  });

  describe('userId to playerId mapping', () => {
    it('should use userId lookup when provided', async () => {
      const userIdLookup = (playerId: string) => `user-${playerId}`;
      collector = new ActionCollector(mockActionService, 'test-block', playerIds, userIdLookup);
      
      const handler = jest.fn().mockReturnValue('result');
      collector.start(handler);
      
      await mockListener({
        body: {
          user: { id: 'user-p1' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '123' }
        }
      });
      
      expect(handler).toHaveBeenCalledWith('p1', 'yes');
      expect(collector.hasCompleted('p1')).toBe(true);
    });

    it('should handle multiple playerIds for same userId', async () => {
      const userIdLookup = jest.fn(() => 'same-user');
      collector = new ActionCollector(mockActionService, 'test-block', playerIds, userIdLookup);
      
      const handler = jest.fn().mockReturnValue('result');
      collector.start(handler);
      
      await mockListener({
        body: {
          user: { id: 'same-user' },
          actions: [{ value: 'yes' }],
          channel: { id: 'ch1' },
          message: { ts: '123' }
        }
      });
      
      expect(handler).toHaveBeenCalledWith('p1', 'yes');
      expect(collector.hasCompleted('p1')).toBe(true);
      
      await mockListener({
        body: {
          user: { id: 'same-user' },
          actions: [{ value: 'no' }],
          channel: { id: 'ch1' },
          message: { ts: '123' }
        }
      });
      
      expect(handler).toHaveBeenCalledWith('p2', 'no');
      expect(collector.hasCompleted('p2')).toBe(true);
    });
  });
});
