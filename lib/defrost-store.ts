import {desc,eq} from 'drizzle-orm';
import {getDb} from '../db';
import {defrostCycles,defrostState} from '../db/schema';
import type {DefrostSummary} from './defrost-data';

// Cycle writes happen in SQLite triggers in the same transaction as an accepted
// snapshot. Rejected, duplicate and metadata-only publications cannot add cycles.
export async function getDefrostSummary(deviceKey:string,expectedFetchedAt:number):Promise<DefrostSummary|null>{
  const db=getDb();
  // One SQL statement reads the tracker and log consistently. If another owner
  // tab published between the snapshot read/write and this query, wait for the
  // next refresh rather than pair different generations of readings and log.
  const rows=await db.select({state:defrostState,cycle:defrostCycles}).from(defrostState).leftJoin(defrostCycles,eq(defrostCycles.deviceKey,defrostState.deviceKey)).where(eq(defrostState.deviceKey,deviceKey)).orderBy(desc(defrostCycles.startObservedAt)).limit(50);
  const state=rows[0]?.state;
  if(!state||state.lastFetchedAt!==expectedFetchedAt)return null;
  const cycles=rows.flatMap(({cycle})=>cycle?[{id:cycle.id,startObservedAt:cycle.startObservedAt,endObservedAt:cycle.endObservedAt,lastObservedAt:cycle.lastObservedAt,targetSeconds:cycle.targetSeconds,partialStart:cycle.partialStart,hasGaps:cycle.hasGaps}]:[]);
  return {lastSignal:state.lastSignal===0||state.lastSignal===1?state.lastSignal:null,lastFetchedAt:state.lastFetchedAt,cycles};
}
