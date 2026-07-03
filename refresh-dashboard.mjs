import {mkdir,writeFile} from 'node:fs/promises';
import {openDatabase,dashboardData} from './database.mjs';

const db=openDatabase();
await mkdir('public/data',{recursive:true});
await writeFile('public/data/latest.json',JSON.stringify(dashboardData(db),null,2));
console.log('Dashboard data refreshed from SQLite.');
