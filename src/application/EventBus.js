export class EventBus {
  constructor() { this.handlers = new Set(); }
  subscribe(handler) { this.handlers.add(handler); return () => this.handlers.delete(handler); }
  publish(event) { for (const handler of this.handlers) handler(event); }
  publishAll(events) { for (const event of events) this.publish(event); }
}
