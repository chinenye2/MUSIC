document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const menuToggle = document.getElementById("menuToggle");
  let artistData;
  const apiBase = ["5500", "5501"].includes(window.location.port)
    ? "http://localhost:3003"
    : "";

  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>'"]/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[character],
    );

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
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const renderEvents = (events) => {
    const list = document.getElementById("eventList");
    if (!list) return;
    list.innerHTML =
      events
        .slice(0, 5)
        .map((event) => {
          const date = new Date(`${event.date}T12:00:00`);
          return `<div class="event-item">${event.imageUrl ? `<div class="event-image"><img src="${escapeHtml(event.imageUrl)}" alt="${escapeHtml(event.title)}" /></div>` : ""}<div class="date-pill"><strong>${date.getDate()}</strong><span>${date.toLocaleString("en-US", { month: "short" }).toUpperCase()}</span></div><div class="item-main"><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.city)} · ${escapeHtml(event.type)}</p>${event.imageNotes ? `<p class="image-notes">📝 ${escapeHtml(event.imageNotes)}</p>` : ""}${event.videoUrl ? `<div class="event-video"><video src="${escapeHtml(event.videoUrl)}" controls playsinline preload="metadata" aria-label="${escapeHtml(event.title)} video"></video></div>` : ""}${event.ticketUrl ? `<a href="${escapeHtml(event.ticketUrl)}" target="_blank" rel="noreferrer" class="ticket-button">Buy Ticket</a>` : ""}</div><div class="item-actions"><button class="icon-btn" data-edit-event="${event.id}" type="button">Edit</button><button class="icon-btn danger" data-delete-event="${event.id}" type="button">Delete</button></div></div>`;
        })
        .join("") || '<p class="empty-state">No events yet.</p>';
  };

  const renderMusic = (tracks) => {
    const list = document.getElementById("musicList");
    if (!list) return;
    const currentYear = new Date().getFullYear();
    console.log("Rendering tracks:", tracks); // Debug log
    list.innerHTML =
      tracks
        .map((track) => {
          // console.log("Track data:", track); // Debug log for each track
          let coverArt;
          const imageUrl = track.imageUrl || track.coverArt;
          if (imageUrl && imageUrl.trim() !== "") {
            // console.log("Using image URL:", imageUrl); // Debug log
            coverArt = `<div class="music-cover-art"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(track.title)} cover art" /></div>`;
          } else if (track.videoUrl) {
            console.log("Using video thumbnail"); // Debug log
            coverArt = `<div class="music-video-thumb"><video src="${escapeHtml(track.videoUrl)}" muted preload="metadata" aria-label="${escapeHtml(track.title)}"></video></div>`;
          } else {
            // console.log("Using music icon fallback"); // Debug log
            coverArt = `<div class="music-cover-art"><span>🎵</span></div>`;
          }
          const displayYear = track.year || currentYear;
          const displayArtist = track.artist || "Maris Quti";
          return `<div class="music-item">
        ${coverArt}
        <div class="music-info">
          <h3>${escapeHtml(track.title)}</h3>
          <p class="music-meta">${escapeHtml(displayArtist)} · ${escapeHtml(track.title)} · ${escapeHtml(track.platform || "Song")} • ${displayYear}</p>
          <div class="music-links">
            ${track.spotifyUrl ? `<a href="${escapeHtml(track.spotifyUrl)}" target="_blank" rel="noreferrer" class="music-link-small">🎵 Spotify</a>` : ""}
            ${track.appleMusicUrl ? `<a href="${escapeHtml(track.appleMusicUrl)}" target="_blank" rel="noreferrer" class="music-link-small">🍎 Apple Music</a>` : ""}
            ${track.youtubeUrl ? `<a href="${escapeHtml(track.youtubeUrl)}" target="_blank" rel="noreferrer" class="music-link-small">📺 YouTube</a>` : ""}
            ${track.audiomackUrl ? `<a href="${escapeHtml(track.audiomackUrl)}" target="_blank" rel="noreferrer" class="music-link-small">🎧 Audiomack</a>` : ""}
            ${track.boomplayUrl ? `<a href="${escapeHtml(track.boomplayUrl)}" target="_blank" rel="noreferrer" class="music-link-small">💥 Boomplay</a>` : ""}
            ${track.musicUrl ? `<a href="${escapeHtml(track.musicUrl)}" target="_blank" rel="noreferrer" class="music-link-small">🎵 Listen</a>` : ""}
            ${track.videoUrl ? `<a href="${escapeHtml(track.videoUrl)}" target="_blank" rel="noreferrer" class="music-link-small">🎥 Video</a>` : ""}
          </div>
        </div>
        <div class="music-actions">
          <button class="icon-btn" data-edit-track="${track.id}" type="button" title="Edit">✏️</button>
          <button class="icon-btn danger" data-delete-track="${track.id}" type="button" title="Delete">🗑️</button>
        </div>
      </div>`;
        })
        .join("") ||
      '<p class="empty-state">No tracks yet. Click "Add track" to upload your music.</p>';
  };

  const renderMessages = (messages) => {
    const list = document.getElementById("messageList");
    if (!list) return;
    list.innerHTML =
      messages
        .slice(0, 5)
        .map(
          (message) =>
            `<div class="message-item ${message.unread ? "unread" : ""}"><div><strong>${escapeHtml(message.sender)}</strong><p>${escapeHtml(message.message)}</p></div><span class="item-actions"><small>${escapeHtml(message.time)}</small><button class="icon-btn" data-edit-message="${message.id}" type="button">Edit</button>${message.unread ? `<button class="icon-btn" data-read-message="${message.id}" type="button">Read</button>` : ""}</span></div>`,
        )
        .join("") || '<p class="empty-state">No booking messages yet.</p>';
  };

  const renderPress = (press) => {
    const list = document.getElementById("pressList");
    if (!list) return;
    list.innerHTML =
      press
        .map(
          (item) =>
            `<li><strong>${escapeHtml(item.source)}</strong><span>${escapeHtml(item.detail)}${item.videoUrl ? `<br><a href="${escapeHtml(item.videoUrl)}" target="_blank" rel="noreferrer" class="video-link">🎥 Video</a>` : ""}</span><div class="item-actions"><button class="icon-btn" data-edit-press="${item.id}" type="button">Edit</button><button class="icon-btn danger" data-delete-press="${item.id}" type="button">Delete</button></div></li>`,
        )
        .join("") || "<li><span>No press features yet.</span></li>";
  };

  const applyArtistData = (artist) => {
    artistData = artist;
    const statMap = {
      profileCompletion: `${artist.stats.profileCompletion}%`,
      tracksLive: artist.stats.tracksLive,
      upcomingEvents: String(artist.stats.upcomingEvents).padStart(2, "0"),
      bookingRequests: artist.stats.bookingRequests,
    };
    Object.entries(statMap).forEach(([key, value]) => {
      const element = document.querySelector(`[data-stat="${key}"]`);
      if (element) element.textContent = value;
    });
    const profileMap = {
      artistName: artist.name,
      stageName: artist.stageName,
      genre: artist.genre,
      location: artist.location,
      bioStatus: artist.bioStatus,
    };
    Object.entries(profileMap).forEach(([key, value]) => {
      const element = document.querySelector(`[data-profile="${key}"]`);
      if (element) element.textContent = value;
    });
    const updatedElement = document.querySelector("[data-profile-updated]");
    if (updatedElement && artist.updatedAt) {
      const ageMs =
        Date.now() -
        new Date(artist.updatedAt.replace(" ", "T") + "Z").getTime();
      const ageDays = Math.floor(ageMs / 86400000);
      updatedElement.textContent =
        ageDays <= 0
          ? "Updated today"
          : ageDays === 1
            ? "Updated yesterday"
            : `Updated ${ageDays} days ago`;
    }

    // Update profile picture in profile panel
    const profilePictureDisplay = document.getElementById(
      "profilePictureDisplay",
    );
    if (profilePictureDisplay) {
      if (artist.profileImageUrl) {
        profilePictureDisplay.innerHTML = `<img src="${escapeHtml(artist.profileImageUrl)}" alt="Profile picture" />`;
      } else {
        profilePictureDisplay.innerHTML = `<span class="profile-placeholder">Mq</span>`;
      }
    }

    // Update sidebar profile picture
    const sidebarProfilePicture = document.getElementById(
      "sidebarProfilePicture",
    );
    if (sidebarProfilePicture) {
      if (artist.profileImageUrl) {
        sidebarProfilePicture.innerHTML = `<img src="${escapeHtml(artist.profileImageUrl)}" alt="Profile picture" />`;
      } else {
        sidebarProfilePicture.innerHTML = `<span class="profile-initials">Mq</span>`;
      }
    }

    // Update logo display in profile panel only
    const logoDisplay = document.getElementById("logoDisplay");
    if (logoDisplay) {
      if (artist.logoImageUrl) {
        logoDisplay.innerHTML = `<img src="${escapeHtml(artist.logoImageUrl)}" alt="Logo" />`;
      } else {
        logoDisplay.innerHTML = `<span class="logo-placeholder">Mq</span>`;
      }
    }

    renderEvents(artist.events);
    renderMusic(artist.tracks);
    renderMessages(artist.bookingMessages);
    renderPress(artist.press);
  };

  const refreshArtist = async () => applyArtistData(await api("/api/artist"));
  const closeModal = () => document.querySelector(".dashboard-modal")?.remove();

  const renderMedia = (items) => {
    const mediaGrid = document.getElementById("mediaGrid");
    if (!mediaGrid) return;
    mediaGrid
      .querySelectorAll(".uploaded-media")
      .forEach((item) => item.remove());
    items.forEach((item) => {
      const mediaBox = document.createElement("div");
      mediaBox.className = "media-box uploaded-media";
      mediaBox.dataset.mediaId = item.id;
      if (item.mimeType.startsWith("video/")) {
        mediaBox.innerHTML = `<video src="${item.url}" controls playsinline preload="metadata" aria-label="${escapeHtml(item.originalName)}"></video><button class="media-play" type="button">Play</button><button class="media-remove" type="button" title="Remove video">Remove</button>`;
        const video = mediaBox.querySelector("video");
        const playButton = mediaBox.querySelector(".media-play");
        playButton.addEventListener("click", async () => {
          if (video.paused) {
            await video.play().catch(() => {
              playButton.textContent = "Unsupported video";
            });
          } else {
            video.pause();
          }
        });
        video.addEventListener("play", () => {
          playButton.textContent = "Pause";
        });
        video.addEventListener("pause", () => {
          playButton.textContent = "Play";
        });
        video.addEventListener("error", () => {
          playButton.textContent = "Unsupported video";
        });
      } else {
        mediaBox.style.backgroundImage = `url("${item.url}")`;
        mediaBox.innerHTML =
          '<button class="media-remove" type="button" title="Remove image">Remove</button>';
      }
      mediaBox
        .querySelector(".media-remove")
        .addEventListener("click", async () => {
          try {
            await api(`/api/media/${item.id}`, { method: "DELETE" });
            mediaBox.remove();
          } catch (error) {
            window.alert(error.message);
          }
        });
      mediaGrid.appendChild(mediaBox);
    });
  };

  const loadMedia = async () => renderMedia(await api("/api/media"));

  const setupMediaUpload = () => {
    const uploadButton = document.getElementById("uploadButton");
    const mediaInput = document.getElementById("mediaInput");
    const mediaGrid = document.getElementById("mediaGrid");
    if (!uploadButton || !mediaInput || !mediaGrid) return;

    uploadButton.addEventListener("click", () => mediaInput.click());
    mediaInput.addEventListener("change", () => {
      Array.from(mediaInput.files).forEach(async (file) => {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/"))
          return;
        if (file.type.startsWith("video/")) {
          const probe = document.createElement("video");
          if (!probe.canPlayType(file.type)) {
            window.alert(
              `${file.name} cannot play in this browser. Convert it to MP4 (H.264/AAC) or WebM.`,
            );
            return;
          }
        }
        try {
          const formData = new FormData();
          formData.append("media", file);
          await api("/api/media", { method: "POST", body: formData });
          await loadMedia();
        } catch (error) {
          window.alert(error.message);
        }
      });
      mediaInput.value = "";
    });
    loadMedia().catch((error) => window.alert(error.message));
  };

  const setupProfilePictureUpload = () => {
    const uploadButton = document.getElementById("uploadProfilePicture");
    const profileImageInput = document.getElementById("profileImageInput");
    if (!uploadButton || !profileImageInput) return;

    uploadButton.addEventListener("click", () => profileImageInput.click());
    profileImageInput.addEventListener("change", async () => {
      const file = profileImageInput.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        window.alert("Please choose an image file");
        return;
      }

      try {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch(`${apiBase}/api/profile-image`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Upload failed");
        }
        const result = await response.json();

        // Update the artist profile with the new image URL
        await api(
          "/api/artist/profile-image",
          jsonOptions("PUT", { profileImageUrl: result.imageUrl }),
        );

        profileImageInput.value = "";
      } catch (error) {
        window.alert(error.message);
      }
    });
  };

  const setupLogoUpload = () => {
    const uploadButton = document.getElementById("uploadLogo");
    const logoInput = document.getElementById("logoInput");
    if (!uploadButton || !logoInput) return;

    uploadButton.addEventListener("click", () => logoInput.click());
    logoInput.addEventListener("change", async () => {
      const file = logoInput.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        window.alert("Please choose an image file");
        return;
      }

      try {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch(`${apiBase}/api/logo-image`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Upload failed");
        }
        const result = await response.json();

        // Update the artist profile with the new logo URL
        await api(
          "/api/artist/logo-image",
          jsonOptions("PUT", { logoImageUrl: result.imageUrl }),
        );

        logoInput.value = "";
      } catch (error) {
        window.alert(error.message);
      }
    });
  };

  const openForm = ({ title, fields, onSubmit }) => {
    closeModal();
    const modal = document.createElement("div");
    modal.className = "dashboard-modal";
    modal.innerHTML = `
      <div class="modal-card">
        <div class="panel-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-btn" data-close-modal type="button">Close</button>
        </div>
        <form class="dashboard-form">
          ${fields
            .map((field) => {
              console.log(" type", field.type?.toLowerCase());
              switch (field.type?.toLowerCase()) {
                case "dropdown":
                  console.log("dropdown type", field);
                  return `
                  <label>${escapeHtml(field.label)}${`<select name="${field.name}" ${field.required !== false ? "required" : ""}>${field.items.map(
                    (item) => {
                      return `<option value='${item}'>${item}</option>`;
                    },
                  )}</select>`}
                  </label>
                `;
                  break;
                case "textarea":
                  return `
                  <label>${escapeHtml(field.label)}${`<textarea name="${field.name}" ${field.required !== false ? "required" : ""}>${escapeHtml(field.value || "")}</textarea>`}
                  </label>
                `;
                default:
                  return `
                  <label>${escapeHtml(field.label)}${`<input name="${field.name}" type="${field.type || "text"}" value="${escapeHtml(field.value || "")}" ${field.required !== false ? "required" : ""} />`}
                  </label>
                `;
              }
              return `
              <label>${escapeHtml(field.label)}${
                field.type === "textarea"
                  ? `<textarea name="${field.name}" ${field.required !== false ? "required" : ""}>${escapeHtml(field.value || "")}</textarea>`
                  : `<input name="${field.name}" type="${field.type || "text"}" value="${escapeHtml(field.value || "")}" ${field.required !== false ? "required" : ""} />`
              }
              </label>`;
            })
            .join("")}
            <div class="form-actions">
              <button class="button secondary" data-close-modal type="button">Cancel</button>
              <button class="button primary" type="submit">Save</button>
            </div>
            <p class="form-error" aria-live="polite"></p>
        </form>
      </div>`;
    document.body.appendChild(modal);
    modal
      .querySelectorAll("[data-close-modal]")
      .forEach((button) => button.addEventListener("click", closeModal));
    modal.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const errorElement = modal.querySelector(".form-error");
      try {
        await onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
        closeModal();
        await refreshArtist();
      } catch (error) {
        errorElement.textContent = error.message;
      }
    });
  };

  const jsonOptions = (method, values) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const openProfileForm = () =>
    openForm({
      title: "Edit artist profile",
      fields: [
        { name: "name", label: "Artist name", value: artistData.name },
        { name: "stageName", label: "Stage name", value: artistData.stageName },
        { name: "genre", label: "Genre", value: artistData.genre },
        { name: "location", label: "Location", value: artistData.location },
        { name: "bioStatus", label: "Bio status", value: artistData.bioStatus },
      ],
      onSubmit: (values) => api("/api/artist", jsonOptions("PUT", values)),
    });
  const openTrackForm = (track = {}) => {
    const form = openForm({
      title: track.id ? "Edit track" : "Add track",
      fields: [
        { name: "title", label: "Track title", value: track.title },
        {
          name: "artist",
          label: "Artist",
          value: track.artist || "Maris Quti",
          required: false,
        },
        {
          name: "year",
          label: "Year",
          value: track.year || new Date().getFullYear(),
          required: false,
          type: "number",
        },
        {
          name: "imageUrl",
          label: "Image URL",
          value: track.imageUrl || "",
          required: false,
          placeholder: "https://example.com/album-art.jpg",
        },
        {
          name: "spotifyUrl",
          label: "Spotify URL",
          value: track.spotifyUrl || "",
          required: false,
          placeholder: "https://open.spotify.com/track/...",
        },
        {
          name: "appleMusicUrl",
          label: "Apple Music URL",
          value: track.appleMusicUrl || "",
          required: false,
          placeholder: "https://music.apple.com/us/song/...",
        },
        {
          name: "youtubeUrl",
          label: "YouTube URL",
          value: track.youtubeUrl || "",
          required: false,
          placeholder: "https://www.youtube.com/watch?v=...",
        },
        {
          name: "audiomackUrl",
          label: "Audiomack URL",
          value: track.audiomackUrl || "",
          required: false,
          placeholder: "https://audiomack.com/...",
        },
        {
          name: "boomplayUrl",
          label: "Boomplay URL",
          value: track.boomplayUrl || "",
          required: false,
          placeholder: "https://www.boomplay.com/...",
        },
        {
          name: "platform",
          label: "Platform",
          value: track.platform || "Spotify",
          required: false,
          type: "dropdown",
          items: ["Spotify", "Youtube", "Audiomack", "Apple Music", "Boomplay"],
        },
        { name: "status", label: "Status", value: track.status || "Live", type: "dropdown", items: ["Live", "Draft"] },
        {
          name: "musicUrl",
          label: "Music URL",
          value: track.musicUrl || "",
          required: false,
          placeholder: "https://open.spotify.com/track/...",
        },
        {
          name: "videoUrl",
          label: "Video URL",
          value: track.videoUrl || "",
          required: false,
          placeholder: "https://youtube.com/watch?v=...",
        },
      ],
      onSubmit: async (values) => {
        // Auto-fetch album art from Spotify if spotifyUrl is provided and no imageUrl
        const platformValue = values.platform?.toLowerCase() || "";
        console.log('submit values', values);
        if (platformValue === "spotify") {
          try {
            const response = await fetch(
              `/api/spotify/album-art?trackUrl=${encodeURIComponent(values.spotifyUrl)}`,
            );
            if (response.ok) {
              const data = await response.json();
              if (data.imageUrl) {
                values.imageUrl = data.imageUrl;
              }
            }
          } catch (error) {
            console.error("Failed to fetch Spotify album art:", error);
          }
        }

        // Also try to fetch from musicUrl if it's a Spotify URL
        // if (
        //   !values.imageUrl &&
        //   values.musicUrl &&
        //   values.musicUrl.includes("spotify.com")
        // ) {
        //   try {
        //     const response = await fetch(
        //       `/api/spotify/album-art?trackUrl=${encodeURIComponent(values.musicUrl)}`,
        //     );
        //     if (response.ok) {
        //       const data = await response.json();
        //       if (data.imageUrl) {
        //         values.imageUrl = data.imageUrl;
        //       }
        //     }
        //   } catch (error) {
        //     console.error(
        //       "Failed to fetch Spotify album art from musicUrl:",
        //       error,
        //     );
        //   }
        // }

        // Auto-fetch album art from iTunes if platform is Apple Music and no imageUrl
        // Auto-fetch album art directly from the Apple Music URL
        if (platformValue === "apple music" && values.appleMusicUrl) {
          try {
            // Extract search term from Apple Music URL or use track title
            let searchTerm = values.title || "";

            // Try to extract a meaningful search term from the Apple Music URL
            const urlMatch = values.appleMusicUrl.match(/\/song\/([^\/]+)/);
            if (urlMatch && urlMatch[1]) {
              // Decode URL and clean it up for search
              searchTerm = decodeURIComponent(urlMatch[1])
                .replace(/-/g, " ")
                .replace(/\d+$/, ""); // Remove trailing numbers
            }

            // Fallback to track title if no URL match
            if (!searchTerm && values.title) {
              searchTerm = values.title;
            }

            if (searchTerm) {
              const urlToBeCalled = `/api/apple-music/album-art?searchTerm=${encodeURIComponent(searchTerm)}`;
              console.log('urlToBeCalled', urlToBeCalled);
              const response = await fetch(urlToBeCalled);

              if (response.ok) {
                const data = await response.json();

                if (data.imageUrl) {
                  values.imageUrl = data.imageUrl;

                  console.log("Apple Music artwork found:", data.imageUrl);
                }
              } else {
                const errorData = await response.json().catch(() => ({}));

                console.error(
                  "Could not fetch Apple Music artwork:",
                  errorData.error || response.statusText,
                );
              }
            }
          } catch (error) {
            console.error("Failed to fetch Apple Music album art:", error);
          }
        }

        // Auto-fetch thumbnail from YouTube if youtubeUrl is provided and no imageUrl
        if (platformValue == "youtube") {
          console.log("Fetching YouTube thumbnail for:", values.youtubeUrl);
          try {
            const response = await fetch(
              `/api/youtube/thumbnail?videoUrl=${encodeURIComponent(values.youtubeUrl)}`,
            );
            console.log("YouTube API response status:", response.status);
            if (response.ok) {
              const data = await response.json();
              console.log("YouTube API response data:", data);
              if (data.imageUrl) {
                values.imageUrl = data.imageUrl;
                console.log(
                  "YouTube thumbnail fetched successfully:",
                  data.imageUrl,
                );
              }
            } else {
              console.error("YouTube API error:", response.status);
            }
          } catch (error) {
            console.error("Failed to fetch YouTube thumbnail:", error);
          }
        }

        // Also try to fetch from videoUrl if it's a YouTube URL
        if (values.videoUrl && values.videoUrl.includes("youtube.com")) {
          try {
            const response = await fetch(
              `/api/youtube/thumbnail?videoUrl=${encodeURIComponent(values.videoUrl)}`,
            );
            if (response.ok) {
              const data = await response.json();
              if (data.imageUrl) {
                values.imageUrl = data.imageUrl;
              }
            }
          } catch (error) {
            console.error(
              "Failed to fetch YouTube thumbnail from videoUrl:",
              error,
            );
          }
        }

        if (platformValue == "audiomack") {
          console.log("Fetching Audiomack artwork for:", values.audiomackUrl);

          try {
            const response = await fetch(
              `/api/audiomack/thumbnail?trackUrl=${encodeURIComponent(
                values.audiomackUrl,
              )}`,
            );

            console.log("Audiomack API response status:", response.status);

            if (response.ok) {
              const data = await response.json();

              console.log("Audiomack API response data:", data);

              if (data.imageUrl) {
                values.imageUrl = data.imageUrl;

                console.log(
                  "Audiomack artwork fetched successfully:",
                  data.imageUrl,
                );
              }
            } else {
              console.error("Audiomack API error:", response.status);
            }
          } catch (error) {
            console.error("Failed to fetch Audiomack artwork:", error);
          }
        }

        if (platformValue === "boomplay") {
          console.log("Fetching Boomplay artwork for:", values.boomplayUrl);

          try {
            const response = await fetch(
              `/api/boomplay/thumbnail?trackUrl=${encodeURIComponent(
                values.boomplayUrl,
              )}`,
            );

            console.log("Boomplay API response status:", response.status);

            if (response.ok) {
              const data = await response.json();

              console.log("Boomplay API response data:", data);

              if (data.imageUrl) {
                values.imageUrl = data.imageUrl;

                console.log(
                  "Boomplay artwork fetched successfully:",
                  data.imageUrl,
                );
              }
            } else {
              console.error("Boomplay API error:", response.status);
            }
          } catch (error) {
            console.error("Failed to fetch Boomplay artwork:", error);
          }
        }

        return api(
          track.id ? `/api/music/${track.id}` : "/api/music",
          jsonOptions(track.id ? "PUT" : "POST", values),
        );
      },
    });

    // Add real-time preview after form opens
    setTimeout(() => {
      const spotifyInput = document.querySelector('input[name="spotifyUrl"]');
      const youtubeInput = document.querySelector('input[name="youtubeUrl"]');
      const appleMusicInput = document.querySelector(
        'input[name="appleMusicUrl"]',
      );
      const imageUrlInput = document.querySelector('input[name="imageUrl"]');

      console.log("Form inputs found:", {
        spotifyInput: !!spotifyInput,
        youtubeInput: !!youtubeInput,
        appleMusicInput: !!appleMusicInput,
        imageUrlInput: !!imageUrlInput,
      });

      if (spotifyInput && imageUrlInput) {
        spotifyInput.addEventListener("blur", async () => {
          const url = spotifyInput.value;
          console.log("Spotify blur event, URL:", url);
          if (url && !imageUrlInput.value) {
            try {
              const response = await fetch(
                `/api/spotify/album-art?trackUrl=${encodeURIComponent(url)}`,
              );
              if (response.ok) {
                const data = await response.json();
                if (data.imageUrl) {
                  imageUrlInput.value = data.imageUrl;
                  console.log("Spotify image auto-fetched:", data.imageUrl);
                }
              }
            } catch (error) {
              console.error("Failed to fetch Spotify image:", error);
            }
          }
        });
      }

      if (youtubeInput && imageUrlInput) {
        youtubeInput.addEventListener("blur", async () => {
          const url = youtubeInput.value;
          console.log("YouTube blur event, URL:", url);
          if (url && !imageUrlInput.value) {
            try {
              const response = await fetch(
                `/api/youtube/thumbnail?videoUrl=${encodeURIComponent(url)}`,
              );
              console.log("YouTube API response status:", response.status);
              if (response.ok) {
                const data = await response.json();
                console.log("YouTube API response data:", data);
                if (data.imageUrl) {
                  imageUrlInput.value = data.imageUrl;
                  console.log("YouTube thumbnail auto-fetched:", data.imageUrl);
                }
              }
            } catch (error) {
              console.error("Failed to fetch YouTube thumbnail:", error);
            }
          }
        });
      }

      if (appleMusicInput && imageUrlInput) {
        appleMusicInput.addEventListener("blur", async () => {
          const url = appleMusicInput.value;
          console.log("Apple Music blur event, URL:", url);
          if (url && !imageUrlInput.value) {
            try {
              // Extract search term from Apple Music URL
              let searchTerm = "";
              const urlMatch = url.match(/\/song\/([^\/]+)/);
              if (urlMatch && urlMatch[1]) {
                searchTerm = decodeURIComponent(urlMatch[1])
                  .replace(/-/g, " ")
                  .replace(/\d+$/, "");
              }

              if (searchTerm) {
                const urlToCall = `/api/apple-music/album-art?searchTerm=${encodeURIComponent(url)}`;
                const response = await fetch(
                  // `/api/apple-music/album-art?searchTerm=${encodeURIComponent(searchTerm)}`,
                  urlToCall,
                );
                console.log(
                  "[BLUR]Apple Music API response status:",
                  response.status,
                  urlToCall
                );
                if (response.ok) {
                  const data = await response.json();
                  console.log("Apple Music API response data:", data);
                  if (data.imageUrl) {
                    imageUrlInput.value = data.imageUrl;
                    console.log(
                      "Apple Music album art auto-fetched:",
                      data.imageUrl,
                    );
                  }
                }
              }
            } catch (error) {
              console.error("Failed to fetch Apple Music album art:", error);
            }
          }
        });
      }
    }, 100);
  };

  const openEventForm = (eventData = {}) => {
    closeModal();
    const modal = document.createElement("div");
    modal.className = "dashboard-modal";
    modal.innerHTML = `<div class="modal-card"><div class="panel-head"><h2>${escapeHtml(eventData.id ? "Edit event" : "Add event")}</h2><button class="icon-btn" data-close-modal type="button">Close</button></div><form class="dashboard-form" id="eventForm"><label>Event name<input name="title" type="text" value="${escapeHtml(eventData.title || "")}" required /></label><label>Date<input name="date" type="date" value="${escapeHtml(eventData.date || "")}" required /></label><label>City<input name="city" type="text" value="${escapeHtml(eventData.city || "")}" required /></label><label>Type<input name="type" type="text" value="${escapeHtml(eventData.type || "Headline")}" required /></label><label>Ticket URL (optional)<input name="ticketUrl" type="text" value="${escapeHtml(eventData.ticketUrl || "")}" /></label><label>Event image (optional)<input name="imageUrl" type="text" value="${escapeHtml(eventData.imageUrl || "")}" placeholder="Or upload image below" /></label><label>Upload image<input name="imageFile" type="file" accept="image/*" /></label><label>Image notes (optional)<textarea name="imageNotes" placeholder="Add private notes about this image...">${escapeHtml(eventData.imageNotes || "")}</textarea></label><label>Event video (optional)<input name="videoUrl" type="text" value="${escapeHtml(eventData.videoUrl || "")}" placeholder="Or upload video below" /></label><label>Upload video<input name="videoFile" type="file" accept="video/*" /></label><div class="form-actions"><button class="button secondary" data-close-modal type="button">Cancel</button><button class="button primary" type="submit">Save</button></div><p class="form-error" aria-live="polite"></p></form></div>`;
    document.body.appendChild(modal);
    modal
      .querySelectorAll("[data-close-modal]")
      .forEach((button) => button.addEventListener("click", closeModal));

    const imageInput = modal.querySelector('input[name="imageFile"]');
    const imageUrlInput = modal.querySelector('input[name="imageUrl"]');

    imageInput.addEventListener("change", async () => {
      const file = imageInput.files[0];
      if (!file) return;

      try {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch(`${apiBase}/api/event-image`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Upload failed");
        }
        const result = await response.json();
        imageUrlInput.value = result.imageUrl;
        imageInput.value = "";
      } catch (error) {
        window.alert(error.message);
      }
    });

    const videoInput = modal.querySelector('input[name="videoFile"]');
    const videoUrlInput = modal.querySelector('input[name="videoUrl"]');

    videoInput.addEventListener("change", async () => {
      const file = videoInput.files[0];
      if (!file) return;

      try {
        const formData = new FormData();
        formData.append("video", file);
        const response = await fetch(`${apiBase}/api/event-video`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Upload failed");
        }
        const result = await response.json();
        videoUrlInput.value = result.videoUrl;
        videoInput.value = "";
      } catch (error) {
        window.alert(error.message);
      }
    });

    modal
      .querySelector("form")
      .addEventListener("submit", async (formEvent) => {
        formEvent.preventDefault();
        const errorElement = modal.querySelector(".form-error");
        try {
          const values = Object.fromEntries(
            new FormData(formEvent.currentTarget),
          );
          delete values.imageFile;
          delete values.videoFile;
          await api(
            eventData.id ? `/api/events/${eventData.id}` : "/api/events",
            jsonOptions(eventData.id ? "PUT" : "POST", values),
          );
          closeModal();
          await refreshArtist();
        } catch (error) {
          errorElement.textContent = error.message;
        }
      });
  };
  const openMessageForm = (message = {}) =>
    openForm({
      title: message.id ? "Edit booking message" : "New booking message",
      fields: [
        { name: "sender", label: "Sender", value: message.sender },
        {
          name: "message",
          label: "Message",
          type: "textarea",
          value: message.message,
        },
      ],
      onSubmit: (values) =>
        api(
          message.id ? `/api/messages/${message.id}` : "/api/messages",
          jsonOptions(message.id ? "PUT" : "POST", values),
        ),
    });
  const openPressForm = (pressItem = {}) => {
    closeModal();
    const modal = document.createElement("div");
    modal.className = "dashboard-modal";
    modal.innerHTML = `<div class="modal-card"><div class="panel-head"><h2>${pressItem.id ? "Edit press feature" : "Add press feature"}</h2><button class="icon-btn" data-close-modal type="button">Close</button></div><form class="dashboard-form" id="pressForm"><label>Publication or achievement<input name="source" type="text" value="${escapeHtml(pressItem.source || "")}" required /></label><label>Details<input name="detail" type="text" value="${escapeHtml(pressItem.detail || "")}" required /></label><label>Video URL (optional)<input name="videoUrl" type="text" value="${escapeHtml(pressItem.videoUrl || "")}" placeholder="Or upload video below" /></label><label>Upload video<input name="videoFile" type="file" accept="video/*" /></label><div class="form-actions"><button class="button secondary" data-close-modal type="button">Cancel</button><button class="button primary" type="submit">Save</button></div><p class="form-error" aria-live="polite"></p></form></div>`;
    document.body.appendChild(modal);
    modal
      .querySelectorAll("[data-close-modal]")
      .forEach((button) => button.addEventListener("click", closeModal));

    const videoInput = modal.querySelector('input[name="videoFile"]');
    const videoUrlInput = modal.querySelector('input[name="videoUrl"]');

    videoInput.addEventListener("change", async () => {
      const file = videoInput.files[0];
      if (!file) return;

      try {
        const formData = new FormData();
        formData.append("video", file);
        const response = await fetch(`${apiBase}/api/press-video`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Upload failed");
        }
        const result = await response.json();
        videoUrlInput.value = result.videoUrl;
        videoInput.value = "";
      } catch (error) {
        window.alert(error.message);
      }
    });

    modal
      .querySelector("form")
      .addEventListener("submit", async (formEvent) => {
        formEvent.preventDefault();
        const errorElement = modal.querySelector(".form-error");
        try {
          const values = Object.fromEntries(
            new FormData(formEvent.currentTarget),
          );
          delete values.videoFile;
          await api(
            pressItem.id ? `/api/press/${pressItem.id}` : "/api/press",
            jsonOptions(pressItem.id ? "PUT" : "POST", values),
          );
          closeModal();
          await refreshArtist();
        } catch (error) {
          errorElement.textContent = error.message;
        }
      });
  };
  const openSettings = () => {
    closeModal();
    const settings = JSON.parse(
      localStorage.getItem("artistDashboardSettings") ||
        '{"publicProfile":true,"emailNotifications":true,"compactLayout":false}',
    );
    const modal = document.createElement("div");
    modal.className = "dashboard-modal";
    modal.innerHTML = `<div class="modal-card"><div class="panel-head"><h2>Settings</h2><button class="icon-btn" data-close-modal type="button">Close</button></div><form class="dashboard-form settings-form"><label class="setting-toggle"><input name="publicProfile" type="checkbox" ${settings.publicProfile ? "checked" : ""} /> Public profile visible</label><label class="setting-toggle"><input name="emailNotifications" type="checkbox" ${settings.emailNotifications ? "checked" : ""} /> Email notifications enabled</label><label class="setting-toggle"><input name="compactLayout" type="checkbox" ${settings.compactLayout ? "checked" : ""} /> Compact dashboard layout</label><div class="form-actions"><button class="button secondary" data-close-modal type="button">Cancel</button><button class="button primary" type="submit">Save settings</button></div><p class="form-error" aria-live="polite"></p></form></div>`;
    document.body.appendChild(modal);
    modal
      .querySelectorAll("[data-close-modal]")
      .forEach((button) => button.addEventListener("click", closeModal));
    modal.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const nextSettings = {
        publicProfile: formData.has("publicProfile"),
        emailNotifications: formData.has("emailNotifications"),
        compactLayout: formData.has("compactLayout"),
      };
      localStorage.setItem(
        "artistDashboardSettings",
        JSON.stringify(nextSettings),
      );
      document.body.classList.toggle(
        "compact-dashboard",
        nextSettings.compactLayout,
      );
      closeModal();
    });
  };

  const savedSettings = JSON.parse(
    localStorage.getItem("artistDashboardSettings") || "{}",
  );
  document.body.classList.toggle(
    "compact-dashboard",
    savedSettings.compactLayout === true,
  );

  document.addEventListener("click", async (event) => {
    const targetButton = event.target.closest("[data-target]");
    if (targetButton) {
      const target = document.getElementById(targetButton.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        document
          .querySelectorAll(".nav-item")
          .forEach((item) =>
            item.classList.toggle("active", item === targetButton),
          );
      }
      return;
    }

    const button = event.target.closest(
      "[data-action], [data-edit-track], [data-delete-track], [data-edit-event], [data-delete-event], [data-edit-message], [data-read-message], [data-edit-press], [data-delete-press]",
    );
    if (!button) return;
    const action = button.dataset.action;
    if (action === "edit-profile") return openProfileForm();
    if (action === "add-track") return openTrackForm();
    if (action === "add-event") return openEventForm();
    if (action === "add-message") return openMessageForm();
    if (action === "add-feature") return openPressForm();
    if (action === "open-settings") return openSettings();
    if (action === "logout") {
      try {
        await api("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      } catch (error) {
        window.alert("Logout failed: " + error.message);
      }
      return;
    }
    try {
      if (button.dataset.editTrack)
        return openTrackForm(
          artistData.tracks.find(
            (item) => String(item.id) === button.dataset.editTrack,
          ),
        );
      if (button.dataset.editEvent)
        return openEventForm(
          artistData.events.find(
            (item) => String(item.id) === button.dataset.editEvent,
          ),
        );
      if (button.dataset.editMessage)
        return openMessageForm(
          artistData.bookingMessages.find(
            (item) => String(item.id) === button.dataset.editMessage,
          ),
        );
      if (button.dataset.editPress)
        return openPressForm(
          artistData.press.find(
            (item) => String(item.id) === button.dataset.editPress,
          ),
        );
      if (button.dataset.deleteTrack && window.confirm("Delete this track?"))
        await api(`/api/music/${button.dataset.deleteTrack}`, {
          method: "DELETE",
        });
      if (button.dataset.deleteEvent && window.confirm("Delete this event?"))
        await api(`/api/events/${button.dataset.deleteEvent}`, {
          method: "DELETE",
        });
      if (button.dataset.readMessage)
        await api(`/api/messages/${button.dataset.readMessage}/read`, {
          method: "PUT",
        });
      if (button.dataset.deletePress)
        await api(`/api/press/${button.dataset.deletePress}`, {
          method: "DELETE",
        });
      await refreshArtist();
    } catch (error) {
      window.alert(error.message);
    }
  });

  refreshArtist().catch((error) => {
    window.alert(error.message);
  });
  setupMediaUpload();
  setupProfilePictureUpload();
  setupLogoUpload();

  // Enhanced mobile sidebar functionality
  if (menuToggle && sidebar) {
    // Create overlay for mobile sidebar
    const overlay = document.createElement("div");
    overlay.className = "sidebar-overlay";
    overlay.style.cssText =
      "position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 15; display: none; opacity: 0; transition: opacity 0.3s ease;";
    document.body.appendChild(overlay);

    const toggleSidebar = () => {
      const isOpen = sidebar.classList.toggle("is-open");
      // Prevent body scroll when sidebar is open on mobile
      if (isOpen) {
        document.body.style.overflow = "hidden";
        overlay.style.display = "block";
        setTimeout(() => (overlay.style.opacity = "1"), 0);
      } else {
        document.body.style.overflow = "";
        overlay.style.opacity = "0";
        setTimeout(() => (overlay.style.display = "none"), 300);
      }
    };

    menuToggle.addEventListener("click", toggleSidebar);
    overlay.addEventListener("click", toggleSidebar);

    // Close sidebar on window resize if switching to desktop
    window.addEventListener("resize", () => {
      if (window.innerWidth > 768 && sidebar.classList.contains("is-open")) {
        sidebar.classList.remove("is-open");
        document.body.style.overflow = "";
        overlay.style.display = "none";
        overlay.style.opacity = "0";
      }
    });

    // Close sidebar when clicking a nav item on mobile
    const navItems = document.querySelectorAll(".nav-item");
    navItems.forEach((item) => {
      item.addEventListener("click", () => {
        if (window.innerWidth <= 768 && sidebar.classList.contains("is-open")) {
          toggleSidebar();
        }
      });
    });
  }

  // Handle escape key to close sidebar
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      sidebar &&
      sidebar.classList.contains("is-open")
    ) {
      sidebar.classList.remove("is-open");
      document.body.style.overflow = "";
      const overlay = document.querySelector(".sidebar-overlay");
      if (overlay) {
        overlay.style.opacity = "0";
        setTimeout(() => (overlay.style.display = "none"), 300);
      }
    }
  });
});
