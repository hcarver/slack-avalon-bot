import { IActionListenerService } from "../interfaces";

/**
 * Slack implementation of IActionListenerService
 * Adapts BoltListenerManager to our interface
 */
export class SlackActionListenerService implements IActionListenerService {
  constructor(private bolt: any) {}

  addActionListener(blockId: string, handler: (context: any) => Promise<void>): string {
    return this.bolt.addActionListener(blockId, handler);
  }

  removeActionListener(listenerId: string): void {
    this.bolt.removeActionListener(listenerId);
  }
}
