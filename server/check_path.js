
const db = require('better-sqlite3')('library.db');
const row = db.prepare('SELECT path FROM tracks LIMIT 1').get();
console.log(row ? row.path : 'No tracks found');
