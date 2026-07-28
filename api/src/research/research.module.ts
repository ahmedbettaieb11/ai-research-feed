import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { mongoProvider } from './mongo.provider';

@Module({
  imports: [BullModule.registerQueue({ name: 'research' })],
  controllers: [ResearchController],
  providers: [ResearchService, mongoProvider],
})
export class ResearchModule {}