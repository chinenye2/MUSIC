const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');

const app = express();
const port = process.env.PORT || 5000;
const dbPath = path.join(__dirname, 'artist-dashboard.db');
const uploadDir = path.join(__dirname, 'uploads');
const authCookieName = 'artist_session';
const sessionSecret = 'force-logout-' + crypto.randomBytes(32).toString('hex');

app.use(cookieParser(sessionSecret));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(uploadDir));

const authenticateUser = (req, res, next) => {
  const sessionCookie = req.cookies[authCookieName];
  
  if (!sessionCookie) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    return res.redirect('/login');
  }

  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie, 'base64').toString());
    
    if (sessionData.expiresAt < Date.now()) {
      res.clearCookie(authCookieName);
      if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Session expired' });
      }
      return res.redirect('/login');
    }
    req.user = sessionData;
    next();
  } catch (error) {
    res.clearCookie(authCookieName);
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Invalid session' });
    }
    return res.redirect('/login');
  }
};

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
      password TEXT NOT NULL,
      name TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const userColumns = await all('PRAGMA table_info(users)');
  if (!userColumns.some((column) => column.name === 'password')) {
    await run('ALTER TABLE users ADD COLUMN password TEXT');
  }

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
      profileImageUrl TEXT,
      logoImageUrl TEXT,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const artistColumns = await all('PRAGMA table_info(artists)');
  if (!artistColumns.some((column) => column.name === 'updatedAt')) {
    await run('ALTER TABLE artists ADD COLUMN updatedAt TEXT');
    await run('UPDATE artists SET updatedAt = CURRENT_TIMESTAMP WHERE updatedAt IS NULL');
  }
  if (!artistColumns.some((column) => column.name === 'profileImageUrl')) {
    await run('ALTER TABLE artists ADD COLUMN profileImageUrl TEXT');
  }
  if (!artistColumns.some((column) => column.name === 'logoImageUrl')) {
    await run('ALTER TABLE artists ADD COLUMN logoImageUrl TEXT');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS music (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      videoUrl TEXT,
      musicUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const musicColumns = await all('PRAGMA table_info(music)');
  if (!musicColumns.some((column) => column.name === 'videoUrl')) {
    await run('ALTER TABLE music ADD COLUMN videoUrl TEXT');
  }
  if (!musicColumns.some((column) => column.name === 'musicUrl')) {
    await run('ALTER TABLE music ADD COLUMN musicUrl TEXT');
  }

  await run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      city TEXT NOT NULL,
      type TEXT NOT NULL,
      ticketUrl TEXT,
      imageUrl TEXT,
      imageNotes TEXT,
      videoUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const eventColumns = await all('PRAGMA table_info(events)');
  if (!eventColumns.some((column) => column.name === 'ticketUrl')) {
    await run('ALTER TABLE events ADD COLUMN ticketUrl TEXT');
  }
  if (!eventColumns.some((column) => column.name === 'imageUrl')) {
    await run('ALTER TABLE events ADD COLUMN imageUrl TEXT');
  }
  if (!eventColumns.some((column) => column.name === 'imageNotes')) {
    await run('ALTER TABLE events ADD COLUMN imageNotes TEXT');
  }
  if (!eventColumns.some((column) => column.name === 'videoUrl')) {
    await run('ALTER TABLE events ADD COLUMN videoUrl TEXT');
  }

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
      videoUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const pressColumns = await all('PRAGMA table_info(press)');
  if (!pressColumns.some((column) => column.name === 'videoUrl')) {
    await run('ALTER TABLE press ADD COLUMN videoUrl TEXT');
  }

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
    profileImageUrl: artist.profileImageUrl,
    logoImageUrl: artist.logoImageUrl,
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

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const sessionData = {
      userId: user.id,
      email: user.email,
      name: user.name,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    };

    const sessionCookie = Buffer.from(JSON.stringify(sessionData)).toString('base64');
    res.cookie(authCookieName, sessionCookie, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({ 
      success: true, 
      user: { id: user.id, email: user.email, name: user.name } 
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const existingUser = await get('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await run(
      'INSERT INTO users (email, password, name) VALUES (?, ?, ?)',
      [email.toLowerCase(), hashedPassword, name || email.split('@')[0]]
    );

    const newUser = await get('SELECT * FROM users WHERE id = ?', [result.id]);
    
    const sessionData = {
      userId: newUser.id,
      email: newUser.email,
      name: newUser.name,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000
    };

    const sessionCookie = Buffer.from(JSON.stringify(sessionData)).toString('base64');
    res.cookie(authCookieName, sessionCookie, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({ 
      success: true, 
      user: { id: newUser.id, email: newUser.email, name: newUser.name } 
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/login', (req, res) => {
  res.clearCookie(authCookieName, { path: '/' });
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/force-logout', (req, res) => {
  res.clearCookie(authCookieName, { path: '/' });
  res.send('Session cleared. <a href="/dashboard">Try dashboard now</a>');
});

app.get('/api/artist', authenticateUser, async (req, res) => {
  try {
    const artist = await getArtistProfile();
    res.json(artist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/artist', authenticateUser, async (req, res) => {
  const { name, stageName, genre, location, bioStatus, profileCompletion, profileImageUrl, logoImageUrl } = req.body || {};

  try {
    await run(
      `UPDATE artists
       SET name = COALESCE(?, name),
           stageName = COALESCE(?, stageName),
           genre = COALESCE(?, genre),
           location = COALESCE(?, location),
           bioStatus = COALESCE(?, bioStatus),
           profileCompletion = COALESCE(?, profileCompletion),
           profileImageUrl = COALESCE(?, profileImageUrl),
           logoImageUrl = COALESCE(?, logoImageUrl),
           updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, stageName, genre, location, bioStatus, profileCompletion, profileImageUrl, logoImageUrl, 'aster-vale']
    );

    res.json(await getArtistProfile());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/artist/profile-image', authenticateUser, async (req, res) => {
  const { profileImageUrl } = req.body || {};

  try {
    await run(
      `UPDATE artists
       SET profileImageUrl = COALESCE(?, profileImageUrl),
           updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [profileImageUrl, 'aster-vale']
    );

    res.json(await getArtistProfile());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/artist/logo-image', authenticateUser, async (req, res) => {
  const { logoImageUrl } = req.body || {};

  try {
    await run(
      `UPDATE artists
       SET logoImageUrl = COALESCE(?, logoImageUrl),
           updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [logoImageUrl, 'aster-vale']
    );

    res.json(await getArtistProfile());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/music', authenticateUser, async (req, res) => {
  try {
    const tracks = await all('SELECT * FROM music ORDER BY createdAt DESC');
    res.json(tracks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/music', authenticateUser, async (req, res) => {
  const { title, platform, status, videoUrl, musicUrl } = req.body || {};

  if (!title || !platform || !status) {
    res.status(400).json({ error: 'title, platform, and status are required' });
    return;
  }

  try {
    const result = await run(
      'INSERT INTO music (title, platform, status, videoUrl, musicUrl) VALUES (?, ?, ?, ?, ?)',
      [title, platform, status, videoUrl || null, musicUrl || null]
    );

    const song = await get('SELECT * FROM music WHERE id = ?', [result.id]);
    res.status(201).json(song);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/music/:id', authenticateUser, async (req, res) => {
  const { title, platform, status, videoUrl, musicUrl } = req.body || {};

  try {
    await run(
      `UPDATE music
       SET title = COALESCE(?, title),
           platform = COALESCE(?, platform),
           status = COALESCE(?, status),
           videoUrl = COALESCE(?, videoUrl),
           musicUrl = COALESCE(?, musicUrl)
       WHERE id = ?`,
      [title, platform, status, videoUrl, musicUrl, Number(req.params.id)]
    );

    const row = await get('SELECT * FROM music WHERE id = ?', [Number(req.params.id)]);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/music/:id', authenticateUser, async (req, res) => {
  try {
    await run('DELETE FROM music WHERE id = ?', [Number(req.params.id)]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/events', authenticateUser, async (req, res) => {
  try {
    const list = await all('SELECT * FROM events ORDER BY date ASC');
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/events', authenticateUser, async (req, res) => {
  const { title, date, city, type, ticketUrl, imageUrl, imageNotes, videoUrl } = req.body || {};

  if (!title || !date || !city || !type) {
    res.status(400).json({ error: 'title, date, city, and type are required' });
    return;
  }

  try {
    const result = await run(
      'INSERT INTO events (title, date, city, type, ticketUrl, imageUrl, imageNotes, videoUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [title, date, city, type, ticketUrl || null, imageUrl || null, imageNotes || null, videoUrl || null]
    );

    const event = await get('SELECT * FROM events WHERE id = ?', [result.id]);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/events/:id', authenticateUser, async (req, res) => {
  const { title, date, city, type, ticketUrl, imageUrl, imageNotes, videoUrl } = req.body || {};

  try {
    await run(
      `UPDATE events
       SET title = COALESCE(?, title),
           date = COALESCE(?, date),
           city = COALESCE(?, city),
           type = COALESCE(?, type),
           ticketUrl = COALESCE(?, ticketUrl),
           imageUrl = COALESCE(?, imageUrl),
           imageNotes = COALESCE(?, imageNotes),
           videoUrl = COALESCE(?, videoUrl)
       WHERE id = ?`,
      [title, date, city, type, ticketUrl, imageUrl, imageNotes, videoUrl, Number(req.params.id)]
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

app.delete('/api/events/:id', authenticateUser, async (req, res) => {
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

app.put('/api/messages/:id', authenticateUser, async (req, res) => {
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

app.put('/api/messages/:id/read', authenticateUser, async (req, res) => {
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

app.post('/api/media', authenticateUser, mediaUpload.single('media'), async (req, res) => {
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

app.delete('/api/media/:id', authenticateUser, async (req, res) => {
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

app.post('/api/media/:id/like', authenticateUser, async (req, res) => {
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

const eventImageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `event-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

app.post('/api/event-image', authenticateUser, eventImageUpload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Choose an image file' });
  }

  try {
    const imageUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({ imageUrl });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: error.message });
  }
});

const profileImageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `profile-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

app.post('/api/profile-image', authenticateUser, profileImageUpload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Choose an image file' });
  }

  try {
    const imageUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({ imageUrl });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: error.message });
  }
});

const logoImageUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `logo-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
});

app.post('/api/logo-image', authenticateUser, logoImageUpload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Choose an image file' });
  }

  try {
    const imageUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({ imageUrl });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: error.message });
  }
});

const eventVideoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `event-video-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype.startsWith('video/'));
  },
});

app.post('/api/event-video', authenticateUser, eventVideoUpload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Choose a video file' });
  }

  try {
    const videoUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({ videoUrl });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: error.message });
  }
});

const pressVideoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `press-video-${crypto.randomUUID()}${extension}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    callback(null, file.mimetype.startsWith('video/'));
  },
});

app.post('/api/press-video', authenticateUser, pressVideoUpload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Choose a video file' });
  }

  try {
    const videoUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({ videoUrl });
  } catch (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/press', authenticateUser, async (req, res) => {
  const { source, detail, videoUrl } = req.body || {};
  if (!source || !detail) {
    return res.status(400).json({ error: 'source and detail are required' });
  }

  try {
    const result = await run('INSERT INTO press (source, detail, videoUrl) VALUES (?, ?, ?)', [source, detail, videoUrl || null]);
    const item = await get('SELECT * FROM press WHERE id = ?', [result.id]);
    return res.status(201).json(item);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete('/api/press/:id', authenticateUser, async (req, res) => {
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

app.get('/dashboard', authenticateUser, (req, res) => {
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
