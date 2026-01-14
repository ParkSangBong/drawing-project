import { PartialType } from '@nestjs/swagger';
import { CreateDrawingDto } from './create-drawing.dto';

export class UpdateDrawingDto extends PartialType(CreateDrawingDto) {}
