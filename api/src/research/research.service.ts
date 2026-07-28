import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { Collection } from 'mongodb';
import { CreateResearchDto } from './dto/create-research.dto';
import { RESULTS_COLLECTION } from './mongo.provider';

@Injectable()
export class ResearchService {
  constructor(
    @InjectQueue('research') private researchQueue: Queue,
    @Inject(RESULTS_COLLECTION) private results: Collection,
  ) {}

  async createResearch(dto: CreateResearchDto) {
    const job = await this.researchQueue.add(
      'summarize',
      { topic: dto.topic, url: dto.url },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
    return { jobId: job.id };
  }

  async getAllResults() {
    return this.results
      .find()
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
  }

  streamProgress(jobId: string): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const redis = new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
      });

      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        redis.disconnect();
      };

      redis.on('error', (err) => {
        console.error(`Redis stream error for job ${jobId}:`, err.message);
        cleanup();
      });

      redis.subscribe(`progress:${jobId}`);

      redis.on('message', (_channel, message) => {
        const data = JSON.parse(message);
        subscriber.next({ data } as MessageEvent);

        if (data.stage === 'done' || data.stage === 'failed') {
          subscriber.complete();
          cleanup();
        }
      });

      return () => {
        cleanup();
      };
    });
  }
}