import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CreateResearchDto } from './dto/create-research.dto';
import { ResearchService } from './research.service';

@Controller('research')
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Post()
  createResearch(@Body() dto: CreateResearchDto) {
    return this.researchService.createResearch(dto);
  }

  @Get()
  getAllResults() {
    return this.researchService.getAllResults();
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.researchService.streamProgress(id);
  }
}