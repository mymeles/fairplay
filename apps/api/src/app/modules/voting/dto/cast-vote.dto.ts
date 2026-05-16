import { IsIn, IsInt } from 'class-validator';

export class CastVoteDto {
  // Pinned to ±1 — the M07 data model + DB check constraint already
  // enforces this, but rejecting at the DTO layer gives a 400 instead of a
  // 500 round trip.
  @IsInt()
  @IsIn([1, -1])
  value!: 1 | -1;
}
