import type { GuestId, QueueEntryId, VoteId } from './ids';

export type VoteValue = 1 | -1;

export interface VoteDto {
  id: VoteId;
  entryId: QueueEntryId;
  guestId: GuestId;
  value: VoteValue;
  createdAt: string;
  updatedAt: string;
}
