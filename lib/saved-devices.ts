import {eq} from 'drizzle-orm';
import {getDb} from '../db';
import {savedDevices,deviceSelection} from '../db/schema';
import {openToken} from './blynk-vault';
import {LEGACY_SERVER} from './blynk-server';
export class DeviceSelectionError extends Error{}
export async function getSelection(){const [state]=await getDb().select().from(deviceSelection).where(eq(deviceSelection.id,1)).limit(1);return state??null;}
export async function getSavedDevice(id:string){const [device]=await getDb().select().from(savedDevices).where(eq(savedDevices.id,id)).limit(1);return device??null;}
export function deviceMetadata(device:typeof savedDevices.$inferSelect,includeSnapshot=false){return {id:device.id,name:device.name,metrics:JSON.parse(device.metrics),createdAt:device.createdAt,...includeSnapshot?{snapshot:device.snapshot?JSON.parse(device.snapshot):null}:{}};}
export async function savedConnection(id:unknown,selectionId:unknown){
  if(typeof id!=='string'||typeof selectionId!=='string')throw new DeviceSelectionError('Select a saved device from the Devices tab.');
  const state=await getSelection();
  if(state?.activeDeviceId!==id||state.selectionId!==selectionId||!state.autoResume)throw new DeviceSelectionError('The selected device changed or disconnected in another owner tab. Select the device again.');
  const device=await getSavedDevice(id);if(!device)throw new DeviceSelectionError('This saved device was removed. Select another device.');
  return {token:await openToken(device.tokenCiphertext,id),host:LEGACY_SERVER};
}
