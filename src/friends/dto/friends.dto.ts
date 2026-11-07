import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  registerDecorator,
} from 'class-validator';

const lowercase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() : value;

export class EmptyFriendsDto {}

export class SendFriendRequestDto {
  @Transform(lowercase)
  @IsUUID()
  addressee_id: string;
}

export class FriendshipIdDto {
  @Transform(lowercase)
  @IsUUID()
  id: string;
}

export class FriendUserIdDto {
  @Transform(lowercase)
  @IsUUID()
  user_id: string;
}

export class FriendRequestsQueryDto {
  @IsOptional()
  @IsIn(['incoming', 'outgoing'])
  direction?: 'incoming' | 'outgoing';
}

export class SearchFriendsQueryDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().normalize('NFC') : value,
  )
  @IsString()
  display_name: string;
}

// Count Unicode code points, matching the contract rather than UTF-16 units.
registerDecorator({
  name: 'displayNameLength',
  target: SearchFriendsQueryDto,
  propertyName: 'display_name',
  validator: {
    validate: (value: unknown) => {
      if (typeof value !== 'string') return false;
      const length = Array.from(value).length;
      return length >= 2 && length <= 50;
    },
    defaultMessage: () => 'display_name must contain 2–50 characters',
  },
});
