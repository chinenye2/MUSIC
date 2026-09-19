document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.getElementById('sidebar');
  const menuToggle = document.getElementById('menuToggle');
  let artistData;
  const apiBase = ['5500', '5501'].includes(window.location.port) ? 'http://localhost:3003' : '';

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));

  const api = async (url, options = {}) => {
    const response = await fetch(`${apiBase}${url}`, options);
    const responseText = await response.text();
    let data = {};
    if (responseText.trim()) {
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { error: responseText.slice(0, 160) };
      }
    }
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const renderEvents = (events) => {
    const list = document.getElementById('eventList');
    if (!list) return;
    list.innerHTML = events.slice(0, 5).map((event) => {
      const date = new Date(`${event.date}T12:00:00`);
      return `<div class="event-item"><div class="date-pill"><strong>${date.getDate()}</strong><span>${date.toLocaleString('en-US', { month: 'short' }).toUpperCase()}</span></div><div class="item-main"><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.city)} · ${escapeHtml(event.type)}</p></div><div class="item-actions"><button class="icon-btn" data-edit-event="${event.id}" type="button">Edit</button><button class="icon-btn danger" data-delete-event="${event.id}" type="button">Delete</button></div></div>`;
    }).join('') || '<p class="empty-state">No events yet.</p>';
  };

  const renderMusic = (tracks) => {
    const list = document.getElementById('musicList');
    if (!list) return;
    list.innerHTML = '<div class="table-row table-header"><span>Track</span><span>Platform</span><span>Status</span><span>Actions</span></div>' + tracks.map((track) => `<div class="table-row"><span>${escapeHtml(track.title)}</span><span>${escapeHtml(track.platform)}</span><span class="badge ${track.status === 'Live' ? 'success' : 'pending'}">${escapeHtml(track.status)}</span><span class="item-actions"><button class="icon-btn" data-edit-track="${track.id}" type="button">Edit</button><button class="icon-btn danger" data-delete-track="${track.id}" type="button">Delete</button></span></div>`).join('');
  };

  const renderMessages = (messages) => {
    const list = document.getElementById('messageList');
    if (!list) return;
    list.innerHTML = messages.slice(0, 5).map((message) => `<div class="message-item ${message.unread ? 'unread' : ''}"><div><strong>${escapeHtml(message.sender)}</strong><p>${escapeHtml(message.message)}</p></div><span class="item-actions"><small>${escapeHtml(message.time)}</small><button class="icon-btn" data-edit-message="${message.id}" type="button">Edit</button>${message.unread ? `<button class="icon-btn" data-read-message="${message.id}" type="button">Read</button>` : ''}</span></div>`).join('') || '<p class="empty-state">No booking messages yet.</p>';
  };

  const renderPress = (press) => {
    const list = document.getElementById('pressList');
    if (!list) return;
    list.innerHTML = press.map((item) => `<li><strong>${escapeHtml(item.source)}</strong><span>${escapeHtml(item.detail)}</span><button class="icon-btn danger" data-delete-press="${item.id}" type="button">Delete</button></li>`).join('') || '<li><span>No press features yet.</span></li>';
  };

  const applyArtistData = (artist) => {
    artistData = artist;
    const statMap = { profileCompletion: `${artist.stats.profileCompletion}%`, tracksLive: artist.stats.tracksLive, upcomingEvents: String(artist.stats.upcomingEvents).padStart(2, '0'), bookingRequests: artist.stats.bookingRequests };
    Object.entries(statMap).forEach(([key, value]) => { const element = document.querySelector(`[data-stat="${key}"]`); if (element) element.textContent = value; });
      const profileMap = { artistName: artist.name, stageName: artist.stageName, genre: artist.genre, location: artist.location, bioStatus: artist.bioStatus };
    Object.entries(profileMap).forEach(([key, value]) => { const element = document.querySelector(`[data-profile="${key}"]`); if (element) element.textContent = value; });
    const updatedElement = document.querySelector('[data-profile-updated]');
    if (updatedElement && artist.updatedAt) {
      const ageMs = Date.now() - new Date(artist.updatedAt.replace(' ', 'T') + 'Z').getTime();
      const ageDays = Math.floor(ageMs / 86400000);
      updatedElement.textContent = ageDays <= 0 ? 'Updated today' : ageDays === 1 ? 'Updated yesterday' : `Updated ${ageDays} days ago`;
    }
    renderEvents(artist.events);
    renderMusic(artist.tracks);
    renderMessages(artist.bookingMessages);
    renderPress(artist.press);
  };

  const refreshArtist = async () => applyArtistData(await api('/api/artist'));
  const closeModal = () => document.querySelector('.dashboard-modal')?.remove();

  const renderMedia = (items) => {
    const mediaGrid = document.getElementById('mediaGrid');
    if (!mediaGrid) return;
    mediaGrid.querySelectorAll('.uploaded-media').forEach((item) => item.remove());
    items.forEach((item) => {
      const mediaBox = document.createElement('div');
      mediaBox.className = 'media-box uploaded-media';
      mediaBox.dataset.mediaId = item.id;
      if (item.mimeType.startsWith('video/')) {
        mediaBox.innerHTML = `<video src="${item.url}" controls playsinline preload="metadata" aria-label="${escapeHtml(item.originalName)}"></video><button class="media-play" type="button">Play</button><button class="media-remove" type="button" title="Remove video">Remove</button>`;
        const video = mediaBox.querySelector('video');
        const playButton = mediaBox.querySelector('.media-play');
        playButton.addEventListener('click', async () => {
          if (video.paused) {
            await video.play().catch(() => { playButton.textContent = 'Unsupported video'; });
          } else {
            video.pause();
          }
        });
        video.addEventListener('play', () => { playButton.textContent = 'Pause'; });
        video.addEventListener('pause', () => { playButton.textContent = 'Play'; });
        video.addEventListener('error', () => { playButton.textContent = 'Unsupported video'; });
      } else {
        mediaBox.style.backgroundImage = `url("${item.url}")`;
        mediaBox.innerHTML = '<button class="media-remove" type="button" title="Remove image">Remove</button>';
      }
      mediaBox.querySelector('.media-remove').addEventListener('click', async () => {
        try {
          await api(`/api/media/${item.id}`, { method: 'DELETE' });
          mediaBox.remove();
        } catch (error) {
          window.alert(error.message);
        }
      });
      mediaGrid.appendChild(mediaBox);
    });
  };

  const loadMedia = async () => renderMedia(await api('/api/media'));

  const setupMediaUpload = () => {
    const uploadButton = document.getElementById('uploadButton');
    const mediaInput = document.getElementById('mediaInput');
    const mediaGrid = document.getElementById('mediaGrid');
    if (!uploadButton || !mediaInput || !mediaGrid) return;

    uploadButton.addEventListener('click', () => mediaInput.click());
    mediaInput.addEventListener('change', () => {
      Array.from(mediaInput.files).forEach(async (file) => {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
        if (file.type.startsWith('video/')) {
          const probe = document.createElement('video');
          if (!probe.canPlayType(file.type)) {
            window.alert(`${file.name} cannot play in this browser. Convert it to MP4 (H.264/AAC) or WebM.`);
            return;
          }
        }
        try {
          const formData = new FormData();
          formData.append('media', file);
          await api('/api/media', { method: 'POST', body: formData });
          await loadMedia();
        } catch (error) {
          window.alert(error.message);
        }
      });
      mediaInput.value = '';
    });
    loadMedia().catch((error) => window.alert(error.message));
  };

  const openForm = ({ title, fields, onSubmit }) => {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'dashboard-modal';
    modal.innerHTML = `<div class="modal-card"><div class="panel-head"><h2>${escapeHtml(title)}</h2><button class="icon-btn" data-close-modal type="button">Close</button></div><form class="dashboard-form">${fields.map((field) => `<label>${escapeHtml(field.label)}${field.type === 'textarea' ? `<textarea name="${field.name}" required>${escapeHtml(field.value || '')}</textarea>` : `<input name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(field.value || '')}" required />`}</label>`).join('')}<div class="form-actions"><button class="button secondary" data-close-modal type="button">Cancel</button><button class="button primary" type="submit">Save</button></div><p class="form-error" aria-live="polite"></p></form></div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', closeModal));
    modal.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorElement = modal.querySelector('.form-error');
      try {
        await onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
        closeModal();
        await refreshArtist();
      } catch (error) { errorElement.textContent = error.message; }
    });
  };

  const jsonOptions = (method, values) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  const openProfileForm = () => openForm({ title: 'Edit artist profile', fields: [{ name: 'name', label: 'Artist name', value: artistData.name }, { name: 'stageName', label: 'Stage name', value: artistData.stageName }, { name: 'genre', label: 'Genre', value: artistData.genre }, { name: 'location', label: 'Location', value: artistData.location }, { name: 'bioStatus', label: 'Bio status', value: artistData.bioStatus }], onSubmit: (values) => api('/api/artist', jsonOptions('PUT', values)) });
  const openTrackForm = (track = {}) => openForm({ title: track.id ? 'Edit track' : 'Add track', fields: [{ name: 'title', label: 'Track title', value: track.title }, { name: 'platform', label: 'Platform', value: track.platform }, { name: 'status', label: 'Status', value: track.status || 'Draft' }], onSubmit: (values) => api(track.id ? `/api/music/${track.id}` : '/api/music', jsonOptions(track.id ? 'PUT' : 'POST', values)) });
  const openEventForm = (event = {}) => openForm({ title: event.id ? 'Edit event' : 'Add event', fields: [{ name: 'title', label: 'Event name', value: event.title }, { name: 'date', label: 'Date', type: 'date', value: event.date }, { name: 'city', label: 'City', value: event.city }, { name: 'type', label: 'Type', value: event.type || 'Headline' }], onSubmit: (values) => api(event.id ? `/api/events/${event.id}` : '/api/events', jsonOptions(event.id ? 'PUT' : 'POST', values)) });
  const openMessageForm = (message = {}) => openForm({ title: message.id ? 'Edit booking message' : 'New booking message', fields: [{ name: 'sender', label: 'Sender', value: message.sender }, { name: 'message', label: 'Message', type: 'textarea', value: message.message }], onSubmit: (values) => api(message.id ? `/api/messages/${message.id}` : '/api/messages', jsonOptions(message.id ? 'PUT' : 'POST', values)) });
  const openPressForm = () => openForm({ title: 'Add press feature', fields: [{ name: 'source', label: 'Publication or achievement', value: '' }, { name: 'detail', label: 'Details', value: '' }], onSubmit: (values) => api('/api/press', jsonOptions('POST', values)) });

  document.addEventListener('click', async (event) => {
    const targetButton = event.target.closest('[data-target]');
    if (targetButton) {
      const target = document.getElementById(targetButton.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === targetButton));
      }
      return;
    }

    const button = event.target.closest('[data-action], [data-edit-track], [data-delete-track], [data-edit-event], [data-delete-event], [data-edit-message], [data-read-message], [data-delete-press]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'edit-profile') return openProfileForm();
    if (action === 'add-track') return openTrackForm();
    if (action === 'add-event') return openEventForm();
    if (action === 'add-message') return openMessageForm();
    if (action === 'add-feature') return openPressForm();
    try {
      if (button.dataset.editTrack) return openTrackForm(artistData.tracks.find((item) => String(item.id) === button.dataset.editTrack));
      if (button.dataset.editEvent) return openEventForm(artistData.events.find((item) => String(item.id) === button.dataset.editEvent));
      if (button.dataset.editMessage) return openMessageForm(artistData.bookingMessages.find((item) => String(item.id) === button.dataset.editMessage));
      if (button.dataset.deleteTrack && window.confirm('Delete this track?')) await api(`/api/music/${button.dataset.deleteTrack}`, { method: 'DELETE' });
      if (button.dataset.deleteEvent && window.confirm('Delete this event?')) await api(`/api/events/${button.dataset.deleteEvent}`, { method: 'DELETE' });
      if (button.dataset.readMessage) await api(`/api/messages/${button.dataset.readMessage}/read`, { method: 'PUT' });
      if (button.dataset.deletePress) await api(`/api/press/${button.dataset.deletePress}`, { method: 'DELETE' });
      await refreshArtist();
    } catch (error) { window.alert(error.message); }
  });

  refreshArtist().catch((error) => { window.alert(error.message); });
  setupMediaUpload();
  if (menuToggle && sidebar) menuToggle.addEventListener('click', () => sidebar.classList.toggle('is-open'));
  document.addEventListener('click', (event) => { if (window.innerWidth <= 760 && sidebar && menuToggle && !sidebar.contains(event.target) && !menuToggle.contains(event.target)) sidebar.classList.remove('is-open'); });
});
