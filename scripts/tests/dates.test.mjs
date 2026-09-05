import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shiftDate, shiftedSchedule, dayDistance} from '../../apps/web/src/lib/dates.ts';
test('date-only moves preserve duration across leap days, month/year changes and DST',()=>{
  for(const [from,delta,to] of [['2024-02-28',1,'2024-02-29'],['2026-12-31',1,'2027-01-01'],['2026-03-28',2,'2026-03-30'],['2026-10-24',2,'2026-10-26']]) assert.equal(shiftDate(from,delta),to);
  for(let delta=-400;delta<=400;delta++){
    const result=shiftedSchedule({start:'2026-03-27',end:'2026-03-31'},delta,'move');
    assert.equal(dayDistance(result.start,result.end),4);
  }
});
test('resize changes only its boundary and never produces a reversed range',()=>{
  const range={start:'2026-09-07',end:'2026-09-12'};
  assert.deepEqual(shiftedSchedule(range,100,'start'),{start:range.end,end:range.end});
  assert.deepEqual(shiftedSchedule(range,-100,'end'),{start:range.start,end:range.start});
  assert.deepEqual(shiftedSchedule(range,2,'end'),{start:range.start,end:'2026-09-14'});
});
