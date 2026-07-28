import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class CreateResearchDto {
  @IsString()
  @IsNotEmpty()
  topic: string;

  @IsUrl()
  @IsNotEmpty()
  url: string;
}
