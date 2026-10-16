import {env} from 'cloudflare:workers';
const encoder=new TextEncoder();
const bytes=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const base64=(value:Uint8Array)=>btoa(String.fromCharCode(...value));
export class VaultError extends Error{}
async function key(purpose:'encryption'|'fingerprint'){
  try{
    const secret=(env as unknown as Record<string,unknown>).BLYNK_VAULT_KEY;
    if(typeof secret!=='string')throw Error();
    const raw=bytes(secret);if(raw.length!==32)throw Error();
    const master=await crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']);
    return await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('Blynk Pulse vault v1'),info:encoder.encode(purpose)},master,purpose==='encryption'?{name:'AES-GCM',length:256}:{name:'HMAC',hash:'SHA-256',length:256},false,purpose==='encryption'?['encrypt','decrypt']:['sign']);
  }catch{throw new VaultError('Saved connections are unavailable. Check the server encryption-key configuration.');}
}
export async function sealToken(token:string,id:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(id)},await key('encryption'),encoder.encode(token));
  return `v1.${base64(iv)}.${base64(new Uint8Array(data))}`;
}
export async function openToken(encrypted:string,id:string){
  try{
    const [version,iv,data,...extra]=encrypted.split('.');
    if(version!=='v1'||!iv||!data||extra.length)throw Error();
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encoder.encode(id)},await key('encryption'),bytes(data));
    return new TextDecoder().decode(plain);
  }catch{throw new VaultError('This saved connection could not be unlocked. Check the server encryption key or save the device again.');}
}
export async function tokenFingerprint(token:string){return base64(new Uint8Array(await crypto.subtle.sign('HMAC',await key('fingerprint'),encoder.encode(token))));}
