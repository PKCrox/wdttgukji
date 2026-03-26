import { createClient } from 'redis';

export class RuntimeQueue {
  constructor(config) {
    this.config = config;
    this.client = createClient({ url: config.redisUrl });
    this.client.on('error', () => {});
  }

  async connect() {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async close() {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async enqueueTasks(taskIds) {
    if (!taskIds.length) return;
    await this.client.rPush(this.config.queueName, taskIds);
  }

  async dequeueTask(timeoutSeconds) {
    const result = await this.client.blPop(this.config.queueName, timeoutSeconds);
    return result?.element || null;
  }
}
