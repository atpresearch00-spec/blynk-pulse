import Dashboard from './dashboard';
import {isDashboardOwner} from '../lib/dashboard-access';
export const dynamic='force-dynamic';
export default async function Home(){return <Dashboard isOwner={await isDashboardOwner()}/>;}
