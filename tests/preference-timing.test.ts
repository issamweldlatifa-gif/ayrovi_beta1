import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { createPreferenceTiming } from '../src/analytics/preferenceTiming';
function response(statusCode=200) { return Object.assign(new EventEmitter(),{statusCode,writableFinished:false}); }
it('records bounded operation totals once without including request data', () => {
  let time=0;
  const log=vi.fn();
  const metric=createPreferenceTiming({now:()=>time,enabled:()=>true,log});
  const res=response(403), next=vi.fn();
  metric.observe('publication_preference_write')({body:{secret:'private'},url:'/private?token=SECRET',headers:{authorization:'secret'}} as any,res as any,next);
  time=12.345; res.writableFinished=true; res.emit('finish'); res.emit('close');
  expect(next).toHaveBeenCalledOnce();
  expect(metric.snapshot()).toEqual({publication_preference_write:{completed:1,aborted:0,http4xx:1,http5xx:0,totalMs:12.35,maxMs:12.35}});
  expect(log).toHaveBeenCalledOnce();
  expect(JSON.parse(log.mock.calls[0][0])).toEqual({event:'preference_timing',operation:'publication_preference_write',outcome:'completed',status:403,durationMs:12.35});
});
it('keeps logs off by default, distinguishes aborted work and returns detached snapshots', () => {
  const log=vi.fn(); const metric=createPreferenceTiming({enabled:()=>false,log}); const res=response();
  metric.observe('publisher_follow_write')({} as any,res as any,()=>{});
  res.emit('close'); res.emit('finish');
  expect(metric.snapshot().publisher_follow_write.aborted).toBe(1);
  expect(metric.snapshot().publisher_follow_write.completed).toBe(0);
  const copy=metric.snapshot(); copy.publisher_follow_write.aborted=99;
  expect(metric.snapshot().publisher_follow_write.aborted).toBe(1); expect(log).not.toHaveBeenCalled();
  expect(()=>metric.observe('user-123' as any)).toThrow();
});
it('does not let a failed diagnostic sink break a completed response', () => {
  const metric=createPreferenceTiming({enabled:()=>true,log:()=>{throw Error('sink unavailable');}});
  const res=response(500);metric.observe('publisher_follow_write')({} as any,res as any,()=>{});
  expect(()=>res.emit('finish')).not.toThrow();
  expect(metric.snapshot().publisher_follow_write.http5xx).toBe(1);
});
