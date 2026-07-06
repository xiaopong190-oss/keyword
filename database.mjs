import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

function ensureKeywordColumns(db){
  const columns=new Set(db.prepare(`PRAGMA table_info(keyword_snapshots)`).all().map(x=>x.name));
  if(!columns.has('sponsored_rank'))db.exec(`ALTER TABLE keyword_snapshots ADD COLUMN sponsored_rank INTEGER`);
  if(!columns.has('sponsored_page'))db.exec(`ALTER TABLE keyword_snapshots ADD COLUMN sponsored_page INTEGER`);
}

function parseKeywordRow(x){
  let extra={};
  try{extra=JSON.parse(x.raw_json||'{}')}catch{}
  return {
    ...x,
    sponsored_rank:x.sponsored_rank??extra.sponsoredRank??null,
    sponsored_page:x.sponsored_page??extra.sponsoredPage??null
  };
}

export function openDatabase(file='data/monitor.db'){
  mkdirSync(dirname(file),{recursive:true});
  const db=new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS product_snapshots(id INTEGER PRIMARY KEY,asin TEXT NOT NULL,captured_at TEXT NOT NULL,status TEXT,title TEXT,price TEXT,rating REAL,reviews INTEGER,bsr_json TEXT,source_url TEXT,raw_json TEXT);
    CREATE TABLE IF NOT EXISTS keyword_snapshots(id INTEGER PRIMARY KEY,asin TEXT NOT NULL,keyword TEXT NOT NULL,captured_at TEXT NOT NULL,organic_rank INTEGER,page INTEGER,status TEXT,raw_json TEXT);
    CREATE TABLE IF NOT EXISTS review_snapshots(id INTEGER PRIMARY KEY,review_key TEXT NOT NULL UNIQUE,asin TEXT NOT NULL,captured_at TEXT NOT NULL,review_date TEXT,rating REAL,title TEXT,body TEXT,verified INTEGER DEFAULT 0,raw_json TEXT);
    CREATE INDEX IF NOT EXISTS idx_product_time ON product_snapshots(asin,captured_at);
    CREATE INDEX IF NOT EXISTS idx_keyword_time ON keyword_snapshots(asin,keyword,captured_at);
    CREATE INDEX IF NOT EXISTS idx_review_time ON review_snapshots(asin,review_date);`);
  ensureKeywordColumns(db);
  return db;
}

export function saveProduct(db,x){
  db.prepare(`INSERT INTO product_snapshots(asin,captured_at,status,title,price,rating,reviews,bsr_json,source_url,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run(x.asin,x.capturedAt,x.status,x.title,x.price,x.rating,x.reviews,JSON.stringify(x.bsr||[]),x.sourceUrl,JSON.stringify(x));
}

export function saveKeyword(db,x){
  db.prepare(`INSERT INTO keyword_snapshots(asin,keyword,captured_at,organic_rank,sponsored_rank,page,sponsored_page,status,raw_json) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run(x.asin,x.keyword,x.capturedAt,x.organicRank??null,x.sponsoredRank??null,x.page??null,x.sponsoredPage??null,x.status,JSON.stringify(x));
}

export function saveReviews(db,items){
  const stmt=db.prepare(`INSERT INTO review_snapshots(review_key,asin,captured_at,review_date,rating,title,body,verified,raw_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(review_key) DO UPDATE SET captured_at=excluded.captured_at,review_date=excluded.review_date,rating=excluded.rating,title=excluded.title,body=excluded.body,verified=excluded.verified,raw_json=excluded.raw_json`);
  for(const x of items)stmt.run(x.reviewKey,x.asin,x.capturedAt,x.date,x.rating,x.title,x.body,x.verified?1:0,JSON.stringify(x));
  return items.length;
}

export function dashboardData(db){
  const products=db.prepare(`SELECT p.* FROM product_snapshots p JOIN (SELECT asin,MAX(captured_at) t FROM product_snapshots WHERE status='success' GROUP BY asin) x ON x.asin=p.asin AND x.t=p.captured_at ORDER BY p.asin`).all().map(x=>({...x,bsr:JSON.parse(x.bsr_json||'[]')}));
  const keywords=db.prepare(`SELECT k.* FROM keyword_snapshots k JOIN (SELECT asin,keyword,MAX(captured_at) t FROM keyword_snapshots GROUP BY asin,keyword) x ON x.asin=k.asin AND x.keyword=k.keyword AND x.t=k.captured_at ORDER BY k.asin,k.keyword`).all().map(parseKeywordRow);
  const productHistory=db.prepare(`SELECT asin,captured_at,reviews,rating,bsr_json FROM product_snapshots WHERE status='success' ORDER BY captured_at`).all().map(x=>({...x,bsr:JSON.parse(x.bsr_json||'[]')}));
  const keywordHistory=db.prepare(`SELECT asin,keyword,captured_at,organic_rank,sponsored_rank,page,sponsored_page,status,raw_json FROM keyword_snapshots ORDER BY captured_at`).all().map(parseKeywordRow);
  const reviewItems=db.prepare(`SELECT asin,review_key,review_date,captured_at,rating,title,body,verified FROM review_snapshots ORDER BY COALESCE(review_date,captured_at) DESC LIMIT 500`).all();
  return {generatedAt:new Date().toISOString(),products,keywords,productHistory,keywordHistory,reviewItems};
}
