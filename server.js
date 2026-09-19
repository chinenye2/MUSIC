const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 5000;
const dbPath = path.join(__dirname, 'artist-dashboard.db');
const uploadDir = path.join(__dirname, 'uploads');
const authCookieName = 'artist_session';

fs.mkdirSync(uploadDir, { recursive: true });

app.use((req, res, next) => {
  const trackingKeys = Object.keys(req.query).filter((key) => key.toLowerCase().startsWith('utm_'));
  if (trackingKeys.length === 0) return next();

  const cleanUrl = new URL(`${req.protocol}://${req.get('host')}${req.originalUrl}`);
  trackingKeys.forEach((key) => cleanUrl.searchParams.delete(key));
  return res.redirect(302, `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
});

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/'));
  },
});

const db = new sqlite3.Database(dbPath, (error) => {
  if (error) {
    console.error('Database connection error:', error.message);
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1|172\.20\.10\.2):\d+$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadDir));

const dbReady = seedDatabase();

app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (error) {
    next(error);
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

async function seedDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expiresAt TEXT NOT NULL,
      usedAt TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS artists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      stageName TEXT NOT NULL,
      genre TEXT NOT NULL,
      location TEXT NOT NULL,
      bioStatus TEXT NOT NULL,
      profileCompletion INTEGER NOT NULL DEFAULT 0,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const artistColumns = await all('PRAGMA table_info(artists)');
  if (!artistColumns.some((column) => column.name === 'updatedAt')) {
    await run('ALTER TABLE artists ADD COLUMN updatedAt TEXT');
    await run('UPDATE artists SET updatedAt = CURRENT_TIMESTAMP WHERE updatedAt IS NULL');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS music (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      city TEXT NOT NULL,
      type TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      message TEXT NOT NULL,
      unread INTEGER NOT NULL DEFAULT 1,
      time TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      originalName TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const mediaColumns = await all('PRAGMA table_info(media)');
  if (!mediaColumns.some((column) => column.name === 'likes')) {
    await run('ALTER TABLE media ADD COLUMN likes INTEGER NOT NULL DEFAULT 0');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS press (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      detail TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const pressRows = await all('SELECT * FROM press');
  if (pressRows.length === 0) {
    await run('INSERT INTO press (source, detail) VALUES (?, ?)', ['Indie Pulse', 'Featured artist interview']);
    await run('INSERT INTO press (source, detail) VALUES (?, ?)', ['Neon Beat', 'Live review and spotlight']);
    await run('INSERT INTO press (source, detail) VALUES (?, ?)', ['Editorial playlist', '11 adds across Spotify']);
    await run('INSERT INTO press (source, detail) VALUES (?, ?)', ['1.2M+ streams', 'Across catalog and singles']);
  }

  await run(
    `INSERT OR IGNORE INTO artists (id, name, stageName, genre, location, bioStatus, profileCompletion)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['aster-vale', 'Aster Vale', 'Aster Vale', 'Alt-pop / Electronic', 'Los Angeles, CA', 'Approved', 88]
  );

  const musicRows = await all('SELECT * FROM music');
  if (musicRows.length === 0) {
    await run(`INSERT INTO music (title, platform, status) VALUES (?, ?, ?)`, ['Run the Lights', 'Spotify', 'Live']);
    await run(`INSERT INTO music (title, platform, status) VALUES (?, ?, ?)`, ['Midnight Signal', 'Apple Music', 'Queued']);
    await run(`INSERT INTO music (title, platform, status) VALUES (?, ?, ?)`, ['Afterglow', 'YouTube', 'Live']);
  }

  const eventRows = await all('SELECT * FROM events');
  if (eventRows.length === 0) {
    await run(`INSERT INTO events (title, date, city, type) VALUES (?, ?, ?, ?)`, ['Sunset Room', '2026-09-28', 'Los Angeles, CA', 'Headline']);
    await run(`INSERT INTO events (title, date, city, type) VALUES (?, ?, ?, ?)`, ['Velvet Hall', '2026-10-11', 'Chicago, IL', 'Featured']);
    await run(`INSERT INTO events (title, date, city, type) VALUES (?, ?, ?, ?)`, ['Glassline Fest', '2026-11-02', 'Brooklyn, NY', 'Festival']);
  }

  const messageRows = await all('SELECT * FROM messages');
  if (messageRows.length === 0) {
    await run(`INSERT INTO messages (sender, message, unread, time) VALUES (?, ?, ?, ?)`, ['North Star Agency', 'Interested in a winter showcase in Seattle.', 1, '2h ago']);
    await run(`INSERT INTO messages (sender, message, unread, time) VALUES (?, ?, ?, ?)`, ['Moonlight Club', 'Booking request for October headline slot.', 0, '1d ago']);
    await run(`INSERT INTO messages (sender, message, unread, time) VALUES (?, ?, ?, ?)`, ['Press House', 'Feature request for an artist spotlight.', 0, '3d ago']);
  }
}

async function getArtistProfile() {
  const artist = await get(
    'SELECT * FROM artists WHERE id = ?',
    ['aster-vale']
  );

  if (!artist) {
    throw new Error('Artist not found');
  }

  const tracks = await all('SELECT * FROM music ORDER BY createdAt DESC');
  const events = await all('SELECT * FROM events ORDER BY date ASC');
  const bookingMessages = await all('SELECT * FROM messages ORDER BY createdAt DESC');

  const press = await all('SELECT * FROM press ORDER BY createdAt DESC');

  return {
    id: artist.id,
    name: artist.name,
    stageName: artist.stageName,
    genre: artist.genre,
    location: artist.location,
    bioStatus: artist.bioStatus,
    profileCompletion: artist.profileCompletion,
    updatedAt: artist.updatedAt,
    tracks,
    events,
    bookingMessages,
    press,
    stats: {
      profileCompletion: artist.profileCompletion,
      tracksLive: tracks.filter((track) => track.status === 'Live').length,
      upcomingEvents: events.length,
      bookingRequests: bookingMessages.length
    }
  };
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((acc, cookiePair) => {
    const [key, ...rest] = cookiePair.trim().split('=');
    if (key && rest.length) {
      acc[key] = decodeURIComponent(rest.join('='));
    }
    return acc;
  }, {});
}

async function findOrCreateUser(email) {
  const existingUser = await get('SELECT * FROM users WHERE email = ?', [email]);

  if (existingUser) {
    return existingUser;
  }

  const result = await run('INSERT INTO users (email, name) VALUES (?, ?)', [email, email.split('@')[0]]);
  return { id: result.id, email, name: email.split('@')[0] };
}

async function sendMagicLinkEmail(email, token) {
  const smtpHost = process.env.SMTP_HOST && process.env.SMTP_HOST.trim();
  const smtpUser = process.env.SMTP_USER && process.env.SMTP_USER.trim();
  const smtpPass = process.env.SMTP_PASS && process.env.SMTP_PASS.trim();

  if (!smtpHost || !smtpUser || !smtpPass) {
    const loginUrl = `http://localhost:${port}/login?token=${token}`;
    console.log(`Magic link email preview for ${email}: ${loginUrl}`);
    return { sent: true, preview: loginUrl, fallback: true };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: smtpUser && smtpPass ? {
      user: smtpUser,
      pass: smtpPass,
    } : undefined,
  });

  const loginUrl = `http://localhost:${port}/login?token=${token}`;
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@astervale.com',
    to: email,
    subject: 'Your Aster Vale dashboard login link',
    text: `Use this link to sign in: ${loginUrl}`,
    html: `<p>Use this link to sign in:</p><p><a href="${loginUrl}">${loginUrl}</a></p>`,
  });

  if (smtpHost && smtpUser && smtpPass) {
    return { sent: true, messageId: info.messageId };
  }
}

async function verifyToken(token) {
  const record = await get(
    'SELECT * FROM auth_tokens WHERE token = ? AND usedAt IS NULL',
    [token]
  );

  if (!record) {
    throw new Error('Invalid or expired login token');
  }

  if (new Date(record.expiresAt).getTime() < Date.now()) {
    throw new Error('Login token expired');
  }

  const user = await get('SELECT * FROM users WHERE id = ?', [record.userId]);
  if (!user) {
    throw new Error('User not found');
  }

  await run('UPDATE auth_tokens SET usedAt = ? WHERE id = ?', [new Date().toISOString(), record.id]);
  return user;
}

app.get('/api/auth/me', async (req, res) => {
  const cookies = parseCookies(req.headers.cookie || '');
  const userId = Number(cookies[authCookieName]);

  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  return res.json({ id: user.id, email: user.email, name: user.name || user.email.split('@')[0] });
});

app.post('/api/auth/request-login', async (req, res) => {
  const { email } = req.body || {};
  const cleanedEmail = String(email || '').trim().toLowerCase();

  if (!cleanedEmail || !cleanedEmail.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  try {
    const user = await findOrCreateUser(cleanedEmail);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await run('DELETE FROM auth_tokens WHERE userId = ?', [user.id]);
    await run('INSERT INTO auth_tokens (userId, token, expiresAt) VALUES (?, ?, ?)', [user.id, token, expiresAt]);

    const emailResult = await sendMagicLinkEmail(cleanedEmail, token);
    return res.json({
      success: true,
      email: cleanedEmail,
      message: 'Check your email for the magic link.',
      previewUrl: emailResult.preview || null,
      link: `http://localhost:${port}/login?token=${token}`,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  const token = String(req.query.token || '').trim();

  if (!token) {
    return res.status(400).json({ error: 'Missing login token' });
  }

  try {
    const user = await verifyToken(token);
    res.cookie(authCookieName, String(user.id), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 12,
    });

    return res.redirect('/');
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(authCookieName, { path: '/' });
  return res.json({ success: true });
});

app.get('/api/artist', async (req, res) => {
  try {
    const artist = await getArtistProfile();
    res.json(artist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/artist', async (req, res) => {
  const { name, stageName, genre, location, bioStatus, profileCompletion } = req.body || {};

  try {
    await run(
      `UPDATE artists
       SET name = COALESCE(?, name),
           stageName = COALESCE(?, stageName),
           genre = COALESCE(?, genre),
           location = COALESCE(?, location),
           bioStatus = COALESCE(?, bioStatus),
           profileCompletion = COALESCE(?, profileCompletion),
           updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, stageName, genre, location, bioStatus, profileCompletion, 'aster-vale']
    );

    res.json(await getArtistProfile());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/music', async (req, res) => {
  try {
    const tracks = await all('SELECT * FROM music ORDER BY createdAt DESC');
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/music', async (req, res) => {
  const { title, platform, status } = req.body || {};

  if (!title || !platform || !status) {
    res.status(400).json({ error: 'title, platform, and status are required' });
    return;
  }

  try {
    const result = await run(
      'INSERT INTO music (title, platform, status) VALUES (?, ?, ?)',
      [title, platform, status]
    );

    const song = await get('SELECT * FROM music WHERE id = ?', [result.id]);
    res.status(201).json(song);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/music/:id', async (req, res) => {
  const { title, platform, status } = req.body || {};

  try {
    await run(
      `UPDATE music
       SET title = COALESCE(?, title),
           platform = COALESCE(?, platform),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [title, platform, status, Number(req.params.id)]
    );

    const row = await get('SELECT * FROM music WHERE id = ?', [Number(req.params.id)]);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/music/:id', async (req, res) => {
  try {
    await run('DELETE FROM music WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events', async (req, res) => {
  try {
    const list = await all('SELECT * FROM events ORDER BY date ASC');
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', async (req, res) => {
  const { title, date, city, type } = req.body || {};

  if (!title || !date || !city || !type) {
    res.status(400).json({ error: 'title, date, city, and type are required' });
    return;
  }

  try {
    const result = await run(
      'INSERT INTO events (title, date, city, type) VALUES (?, ?, ?, ?)',
      [title, date, city, type]
    );

    const event = await get('SELECT * FROM events WHERE id = ?', [result.id]);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/events/:id', async (req, res) => {
  const { title, date, city, type } = req.body || {};

  try {
    await run(
      `UPDATE events
       SET title = COALESCE(?, title),
           date = COALESCE(?, date),
           city = COALESCE(?, city),
           type = COALESCE(?, type)
       WHERE id = ?`,
      [title, date, city, type, Number(req.params.id)]
    );

    const event = await get('SELECT * FROM events WHERE id = ?', [Number(req.params.id)]);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    return res.json(event);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    await run('DELETE FROM events WHERE id = ?', [Number(req.params.id)]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const list = await all('SELECT * FROM messages ORDER BY createdAt DESC');
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages', async (req, res) => {
  const { sender, message, unread = true } = req.body || {};

  if (!sender || !message) {
    res.status(400).json({ error: 'sender and message are required' });
    return;
  }

  try {
    const result = await run(
      'INSERT INTO messages (sender, message, unread, time) VALUES (?, ?, ?, ?)',
      [sender, message, unread ? 1 : 0, new Date().toLocaleString()]
    );

    const item = await get('SELECT * FROM messages WHERE id = ?', [result.id]);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/messages/:id', async (req, res) => {
  const { sender, message, unread } = req.body || {};

  try {
    await run(
      `UPDATE messages
       SET sender = COALESCE(?, sender),
           message = COALESCE(?, message),
           unread = COALESCE(?, unread)
       WHERE id = ?`,
      [sender, message, typeof unread === 'boolean' ? (unread ? 1 : 0) : unread, Number(req.params.id)]
    );

    const item = await get('SELECT * FROM messages WHERE id = ?', [Number(req.params.id)]);
    if (!item) {
      return res.status(404).json({ error: 'Message not found' });
    }
    return res.json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.put('/api/messages/:id/read', async (req, res) => {
  try {
    await run('UPDATE messages SET unread = 0 WHERE id = ?', [Number(req.params.id)]);
    const item = await get('SELECT * FROM messages WHERE id = ?', [Number(req.params.id)]);
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/media', async (req, res) => {
  try {
    const media = await all('SELECT * FROM media ORDER BY createdAt DESC');
    res.json(media.map((item) => ({ ...item, url: `/uploads/${item.filename}` })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/media', mediaUpload.single('media'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Choose an image or video file' });
  }

  try {
    const result = await run(
      'INSERT INTO media (filename, originalName, mimeType) VALUES (?, ?, ?)',
      [req.file.filename, req.file.originalname, req.file.mimetype]
    );
    const item = await get('SELECT * FROM media WHERE id = ?', [result.id]);
    return res.status(201).json({ ...item, url: `/uploads/${item.filename}` });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/media/:id', async (req, res) => {
  try {
    const item = await get('SELECT * FROM media WHERE id = ?', [Number(req.params.id)]);
    if (!item) {
      return res.status(404).json({ error: 'Media not found' });
    }
    await run('DELETE FROM media WHERE id = ?', [Number(req.params.id)]);
    fs.unlink(path.join(uploadDir, item.filename), () => {});
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/media/:id/like', async (req, res) => {
  try {
    await run('UPDATE media SET likes = likes + 1 WHERE id = ?', [Number(req.params.id)]);
    const item = await get('SELECT * FROM media WHERE id = ?', [Number(req.params.id)]);
    if (!item) {
      return res.status(404).json({ error: 'Media not found' });
    }
    return res.json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/press', async (req, res) => {
  const { source, detail } = req.body || {};
  if (!source || !detail) {
    return res.status(400).json({ error: 'source and detail are required' });
  }

  try {
    const result = await run('INSERT INTO press (source, detail) VALUES (?, ?)', [source, detail]);
    const item = await get('SELECT * FROM press WHERE id = ?', [result.id]);
    return res.status(201).json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/press/:id', async (req, res) => {
  try {
    await run('DELETE FROM press WHERE id = ?', [Number(req.params.id)]);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'contact.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

if (require.main === module) {
  dbReady.then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`Artist dashboard API running on http://localhost:${port}`);
    });
  }).catch((error) => {
    console.error('Failed to start app:', error);
    process.exit(1);
  });
}

module.exports = { app, db };
