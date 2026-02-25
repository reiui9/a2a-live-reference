import { EventEmitter } from 'node:events';

export type PubSubAdapter = {
  publish(channel: string, payload: string): void;
  subscribe(channel: string, onMessage: (payload: string) => void): () => void;
};

export class InMemoryPubSub implements PubSubAdapter {
  private bus = new EventEmitter();

  publish(channel: string, payload: string) {
    this.bus.emit(channel, payload);
  }

  subscribe(channel: string, onMessage: (payload: string) => void) {
    this.bus.on(channel, onMessage);
    return () => this.bus.off(channel, onMessage);
  }
}
