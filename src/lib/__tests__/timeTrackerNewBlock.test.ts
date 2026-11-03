import { suggestNewBlockTimes } from '../timeTracker';

const b = (startTime: string, endTime: string) => ({ startTime, endTime });

function expectSlot(actual: { start: string; end: string }, start: string, end: string, msg: string) {
  if (actual.start !== start || actual.end !== end) {
    throw new Error(`Assertion failed: ${msg} (got ${actual.start}-${actual.end}, want ${start}-${end})`);
  }
}

expectSlot(suggestNewBlockTimes([]), '00:00', '07:00', 'an empty day starts with the night block');
expectSlot(suggestNewBlockTimes([b('00:00', '07:00'), b('07:00', '08:30')]), '08:30', '09:30', 'follows the last block');
expectSlot(
  suggestNewBlockTimes([b('09:00', '10:00'), b('13:00', '14:00')]),
  '14:00',
  '15:00',
  'follows the last block even when an earlier gap is free'
);
expectSlot(
  suggestNewBlockTimes([b('00:00', '07:00'), b('23:00', '00:00')]),
  '07:00',
  '08:00',
  'skips the evening part of a sleep block that closes the day at midnight'
);
expectSlot(
  suggestNewBlockTimes([b('00:00', '07:00'), b('07:30', '08:00'), b('08:20', '08:40'), b('23:30', '00:00')]),
  '08:40',
  '09:40',
  'starts after the last block before the evening tail'
);
expectSlot(
  suggestNewBlockTimes([b('00:00', '07:00'), b('07:00', '22:30'), b('23:00', '00:00')]),
  '22:30',
  '23:00',
  'shortens the block to the next one'
);
expectSlot(suggestNewBlockTimes([b('00:00', '07:00')], 15 * 60 + 2), '15:15', '16:15', 'today never suggests the past');
expectSlot(suggestNewBlockTimes([], 15 * 60), '15:00', '16:00', 'an empty today starts from now');
expectSlot(
  suggestNewBlockTimes([b('00:00', '07:00'), b('09:00', '00:00')]),
  '07:00',
  '08:00',
  'uses the first free stretch when nothing is free after the last block'
);
expectSlot(suggestNewBlockTimes([b('00:00', '12:00'), b('12:00', '00:00')]), '09:00', '10:00', 'a full day falls back to 9:00 AM');

console.log('timeTracker new block fixtures: all passed');
