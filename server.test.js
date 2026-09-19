const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./server');

const server = app.listen(0);

async function request(path, options = {}) {
  const port = server.address().port;
  return fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
}

test('health endpoint works', async () => {
  const response = await request('/health');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.status, 'ok');
});

test('artist endpoint returns data', async () => {
  const response = await request('/api/artist');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.name, 'Aster Vale');
  assert.ok(Array.isArray(data.tracks));
});

test('login request creates a magic-link token', async () => {
  const response = await request('/api/auth/request-login', {
    method: 'POST',
    body: JSON.stringify({ email: 'fan@example.com' }),
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.email, 'fan@example.com');
  assert.ok(data.link.includes('/login?token='));
});

test('artist profile can be updated', async () => {
  const response = await request('/api/artist', {
    method: 'PUT',
    body: JSON.stringify({ stageName: 'Aster Vale', genre: 'Synthwave / Indie Pop', location: 'Brooklyn, NY' }),
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.genre, 'Synthwave / Indie Pop');
  assert.equal(data.location, 'Brooklyn, NY');
});

test('music CRUD works', async () => {
  const createResponse = await request('/api/music', {
    method: 'POST',
    body: JSON.stringify({ title: 'Neon Heart', platform: 'Spotify', status: 'Draft' }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.title, 'Neon Heart');

  const listResponse = await request('/api/music');
  assert.equal(listResponse.status, 200);
  const songs = await listResponse.json();
  assert.ok(songs.some((song) => song.title === 'Neon Heart'));

  const updateResponse = await request(`/api/music/${created.id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'Live' }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.status, 'Live');

  const deleteResponse = await request(`/api/music/${created.id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
});

test('events and booking messages can be managed', async () => {
  const eventResponse = await request('/api/events', {
    method: 'POST',
    body: JSON.stringify({ title: 'Night Shift', date: '2026-12-18', city: 'Miami, FL', type: 'Headline' }),
  });
  assert.equal(eventResponse.status, 201);
  const event = await eventResponse.json();
  assert.equal(event.city, 'Miami, FL');

  const eventUpdateResponse = await request(`/api/events/${event.id}`, {
    method: 'PUT',
    body: JSON.stringify({ city: 'Austin, TX' }),
  });
  assert.equal(eventUpdateResponse.status, 200);
  const updatedEvent = await eventUpdateResponse.json();
  assert.equal(updatedEvent.city, 'Austin, TX');

  const messageResponse = await request('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ sender: 'Blue Room', message: 'Would love to book a live session.', unread: true }),
  });
  assert.equal(messageResponse.status, 201);
  const message = await messageResponse.json();
  assert.equal(message.sender, 'Blue Room');

  const messageUpdateResponse = await request(`/api/messages/${message.id}`, {
    method: 'PUT',
    body: JSON.stringify({ message: 'Updated booking details.', unread: false }),
  });
  assert.equal(messageUpdateResponse.status, 200);
  const updatedMessage = await messageUpdateResponse.json();
  assert.equal(updatedMessage.message, 'Updated booking details.');
  assert.equal(updatedMessage.unread, 0);
});

process.on('exit', () => {
  server.close();
});
