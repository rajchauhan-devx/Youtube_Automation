import type { Account } from './accounts.js';
import {
  SELECTIVE_MOTION_DIRECTION,
  isImageOnlyShorts,
  getChannelMotionPolicy,
  type MotionEditorialPolicy,
  type ChannelMotionPolicyKey,
  type ChannelIdentityQuery,
} from '@tubeflow/editing-contracts';

export {
  SELECTIVE_MOTION_DIRECTION,
  isImageOnlyShorts,
  getChannelMotionPolicy,
};

export type {
  MotionEditorialPolicy,
  ChannelMotionPolicyKey,
  ChannelIdentityQuery,
};

export function channelMotionPolicy(
  account: Partial<Account> = {},
  narrationLanguage: 'en' | 'hi' = 'en',
  sourceContext = ''
): MotionEditorialPolicy {
  return getChannelMotionPolicy(
    {
      id: account.id,
      name: account.name,
      youtubeChannelTitle: account.youtubeChannelTitle,
      sourceContext,
    },
    narrationLanguage,
    sourceContext
  );
}

