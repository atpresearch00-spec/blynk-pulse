import {getChatGPTUser} from '../app/chatgpt-auth';
const OWNER_EMAIL='akhil2000.ap@gmail.com';
export function matchesOwner(email:unknown):boolean {return typeof email==='string'&&email.trim().toLowerCase()===OWNER_EMAIL;}
export async function isDashboardOwner(){const user=await getChatGPTUser();return matchesOwner(user?.email);}
