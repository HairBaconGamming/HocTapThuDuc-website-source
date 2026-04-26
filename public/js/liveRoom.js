document.addEventListener("DOMContentLoaded", () => {
  const boot = window.LIVE_ROOM_BOOTSTRAP || {};
  const session = boot.session || {};
  const currentUser = boot.currentUser || {};
  const canModerate = session.permissions?.canModerate || currentUser.role === "host" || currentUser.role === "moderator";

  const elements = {
    statusBadge: document.getElementById("liveStatusBadge"),
    viewerCount: document.getElementById("liveViewerCount"),
    peakCount: document.getElementById("livePeakCount"),
    connectionState: document.getElementById("liveConnectionState"),
    stageHeadline: document.getElementById("liveStageHeadline"),
    stageSubtitle: document.getElementById("liveStageSubtitle"),
    stagePlaceholder: document.getElementById("liveStagePlaceholder"),
    stagePrimary: document.getElementById("liveStagePrimary"),
    stageGrid: document.getElementById("liveStageRemoteGrid"),
    chatFeed: document.getElementById("liveChatFeed"),
    questionFeed: document.getElementById("liveQuestionFeed"),
    handFeed: document.getElementById("liveHandFeed"),
    peopleFeed: document.getElementById("livePeopleFeed"),
    chatForm: document.getElementById("liveChatForm"),
    questionForm: document.getElementById("liveQuestionForm"),
    startButton: document.getElementById("liveStartButton"),
    endButton: document.getElementById("liveEndButton"),
    raiseHandButton: document.getElementById("liveRaiseHandButton"),
    screenShareButton: document.getElementById("liveScreenShareButton"),
    screenShareContainer: document.getElementById("liveScreenShareContainer"),
  };

  let socket = null;
  let room = null;
  let localTracks = [];
  let attendanceTimer = null;
  let livekitConnected = false;
  let isScreenSharing = false;
  const seenChatIds = new Set((boot.chatMessages || []).map((entry) => entry.id));

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character] || character;
    });
  }

  function setConnectionState(text) {
    if (elements.connectionState) {
      elements.connectionState.textContent = text;
    }
  }

  function setStageState(headline, subtitle) {
    if (elements.stagePlaceholder) {
      elements.stagePlaceholder.hidden = false;
    }
    if (elements.stageHeadline) elements.stageHeadline.textContent = headline;
    if (elements.stageSubtitle) elements.stageSubtitle.textContent = subtitle;
  }

  function setStatusBadge(label, tone) {
    if (!elements.statusBadge) return;
    elements.statusBadge.textContent = label;
    elements.statusBadge.className = `live-room-pill live-room-pill--${tone || "scheduled"}`;
  }

  function updateModeratorButtons(status) {
    if (!canModerate) return;
    if (elements.startButton) elements.startButton.hidden = status === "live";
    if (elements.endButton) elements.endButton.hidden = status !== "live";
    if (elements.screenShareButton) elements.screenShareButton.hidden = status !== "live";
  }

  function createFeedItem(avatar, username, content, extraHtml = "") {
    const wrapper = document.createElement("article");
    wrapper.className = "live-feed-item";
    wrapper.innerHTML = `
      <img src="${escapeHtml(avatar)}" alt="${escapeHtml(username)}" class="live-feed-item__avatar">
      <div>
        <strong>${escapeHtml(username)}</strong>
        <p>${escapeHtml(content)}</p>
        ${extraHtml}
      </div>
    `;
    return wrapper;
  }

  function appendChatMessage(message) {
    if (!elements.chatFeed) return;
    if (message?.id && seenChatIds.has(message.id)) return;
    if (message?.id) seenChatIds.add(message.id);
    const item = createFeedItem(message.avatar, message.username, message.content);
    elements.chatFeed.appendChild(item);
    elements.chatFeed.scrollTop = elements.chatFeed.scrollHeight;
  }

  function upsertQuestion(question) {
    if (!elements.questionFeed) return;
    let item = elements.questionFeed.querySelector(`[data-question-id="${question.id}"]`);
    const actions = canModerate
      ? `
          <button type="button" class="live-mini-btn js-question-status" data-question-id="${question.id}" data-status="pinned">Ghim</button>
          <button type="button" class="live-mini-btn js-question-status" data-question-id="${question.id}" data-status="answered">Đã trả lời</button>
          <button type="button" class="live-mini-btn js-question-status" data-question-id="${question.id}" data-status="dismissed">Ẩn</button>
        `
      : "";

    if (!item) {
      item = createFeedItem(
        question.avatar,
        question.username,
        question.content,
        `<div class="live-feed-item__actions"><span class="live-room-pill">${question.status}</span>${actions}</div>`
      );
      item.dataset.questionId = question.id;
      elements.questionFeed.prepend(item);
      return;
    }

    const statusBadge = item.querySelector(".live-room-pill");
    if (statusBadge) statusBadge.textContent = question.status;
  }

  function upsertHand(hand) {
    if (!elements.handFeed) return;
    let item = elements.handFeed.querySelector(`[data-hand-id="${hand.id}"]`);
    const actions = canModerate
      ? `
          <div class="live-feed-item__actions">
            <button type="button" class="live-mini-btn js-hand-status" data-hand-id="${hand.id}" data-status="accepted">Mời phát biểu</button>
            <button type="button" class="live-mini-btn js-hand-status" data-hand-id="${hand.id}" data-status="lowered">Hạ tay</button>
          </div>
        `
      : "";

    if (!item) {
      item = createFeedItem(
        hand.avatar,
        hand.username,
        `Trạng thái: ${hand.status}`,
        actions
      );
      item.dataset.handId = hand.id;
      elements.handFeed.prepend(item);
      return;
    }

    const paragraph = item.querySelector("p");
    if (paragraph) paragraph.textContent = `Trạng thái: ${hand.status}`;
  }

  function renderPeople(users) {
    if (!elements.peopleFeed) return;
    elements.peopleFeed.innerHTML = "";

    if (!Array.isArray(users) || users.length === 0) {
      const empty = document.createElement("div");
      empty.className = "live-empty-inline";
      empty.textContent = "Chưa có ai hiện diện trong phòng.";
      elements.peopleFeed.appendChild(empty);
      return;
    }

    users.forEach((user) => {
      const item = createFeedItem(
        user.avatar,
        user.username,
        `Vai trò: ${user.role || "viewer"}`
      );
      elements.peopleFeed.appendChild(item);
    });
  }

  function createVideoTile(id, label) {
    let tile = document.getElementById(`live-video-${id}`);
    if (tile) return tile;

    tile = document.createElement("div");
    tile.className = "live-video-tile";
    tile.id = `live-video-${id}`;
    tile.innerHTML = `<span class="live-video-tile__label">${escapeHtml(label)}</span>`;
    return tile;
  }

  function attachTrack(track, participant, isLocal = false) {
    if (!track) return;

    const isScreenShare = track.source === LivekitClient?.Track?.Source?.ScreenShare
      || track.source === 'screen_share';

    if (track.kind === "audio") {
      const audioElement = track.attach();
      audioElement.autoplay = true;
      audioElement.style.display = "none";
      document.body.appendChild(audioElement);
      return;
    }

    // Screen share track — render in dedicated container
    if (isScreenShare) {
      const container = elements.screenShareContainer;
      if (container) {
        container.querySelectorAll("video").forEach((v) => v.remove());
        const videoNode = track.attach();
        videoNode.style.width = "100%";
        videoNode.style.height = "100%";
        videoNode.style.objectFit = "contain";
        videoNode.style.borderRadius = "12px";
        container.prepend(videoNode);
        container.hidden = false;
        if (elements.stagePrimary) elements.stagePrimary.hidden = true;
      }
      return;
    }

    const identity = participant?.identity || (isLocal ? "local" : `remote-${Date.now()}`);
    const label = isLocal ? "Bạn" : participant?.name || participant?.identity || "Participant";
    const tile = createVideoTile(identity, label);
    const node = track.attach();
    tile.querySelectorAll("video").forEach((element) => element.remove());
    tile.prepend(node);

    if (isLocal) {
      elements.stagePrimary.querySelectorAll(".live-video-tile").forEach((node) => node.remove());
      elements.stagePrimary.appendChild(tile);
    } else {
      elements.stageGrid.appendChild(tile);
    }
    if (elements.stagePlaceholder) elements.stagePlaceholder.hidden = true;
  }

  function removeParticipantTracks(identity) {
    const tile = document.getElementById(`live-video-${identity}`);
    if (tile) tile.remove();
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Yêu cầu room thất bại.");
    }
    return payload;
  }

  async function pingAttendance() {
    if (document.visibilityState !== "visible") return;
    try {
      const payload = await apiRequest(`/live/sessions/${session.id}/attendance/ping`, {
        method: "POST",
      });
      if (payload.attendance?.rewardPoints > 0 && typeof showAlert === "function") {
        showAlert(
          `Bạn vừa đủ attendance live và nhận +${payload.attendance.rewardPoints} điểm.`,
          "success",
          3800
        );
      }
    } catch (error) {
      console.warn(error.message);
    }
  }

  function startAttendanceLoop() {
    clearInterval(attendanceTimer);
    pingAttendance();
    attendanceTimer = setInterval(pingAttendance, 60 * 1000);
  }

  async function ensureRoomConnection() {
    if (livekitConnected || !session.id) return;

    if (session.status !== "live") {
      setConnectionState("Đang chờ host");
      setStageState(
        "Phòng đang ở chế độ chờ",
        "Host sẽ bật live từ nút điều khiển khi sẵn sàng."
      );
      return;
    }

    setConnectionState("Đang kết nối");
    startAttendanceLoop();

    try {
      const tokenPayload = await apiRequest(`/live/sessions/${session.id}/token`, {
        method: "POST",
      });

      if (!tokenPayload.joinReady) {
        setConnectionState("Lobby");
        setStageState("Lobby nội bộ", tokenPayload.waitingReason || "Hãy chờ host lên sóng.");
        return;
      }

      if (tokenPayload.providerKind === "mock" || typeof LivekitClient === "undefined") {
        livekitConnected = true;
        setConnectionState("Mock room");
        setStageState(
          "Mock room đang hoạt động",
          "Môi trường hiện chưa bật media provider nên phòng đang chạy ở chế độ fallback."
        );
        return;
      }

      room = new LivekitClient.Room();
      livekitConnected = true;

      room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, publication, participant) => {
        attachTrack(track, participant, false);
      });

      room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        const wasScreenShare = track.source === LivekitClient?.Track?.Source?.ScreenShare
          || track.source === 'screen_share';
        track.detach().forEach((element) => element.remove());
        if (wasScreenShare && elements.screenShareContainer) {
          elements.screenShareContainer.querySelectorAll("video").forEach((v) => v.remove());
          elements.screenShareContainer.hidden = true;
          if (elements.stagePrimary) elements.stagePrimary.hidden = false;
        }
        if (participant?.identity) {
          removeParticipantTracks(participant.identity);
        }
      });

      room.on(LivekitClient.RoomEvent.Disconnected, () => {
        setConnectionState("Mất kết nối");
        setStageState("Mất kết nối media", "Thử tải lại trang hoặc xin token mới.");
        livekitConnected = false;
      });

      await room.connect(tokenPayload.url, tokenPayload.token);
      setConnectionState("Đã kết nối");

      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((publication) => {
          if (publication.track) {
            attachTrack(publication.track, participant, false);
          }
        });
      });

      if (tokenPayload.role === "host" || tokenPayload.role === "moderator") {
        localTracks = await LivekitClient.createLocalTracks({ audio: true, video: true });
        for (const track of localTracks) {
          await room.localParticipant.publishTrack(track);
          attachTrack(track, room.localParticipant, true);
        }
      } else {
        setStageState("Đang xem live", "Chờ track của host và các moderator xuất hiện.");
      }
    } catch (error) {
      livekitConnected = false;
      setConnectionState("Lỗi kết nối");
      setStageState("Không vào được phòng media", error.message);
      if (typeof showAlert === "function") {
        showAlert(error.message, "error", 4200);
      }
    }
  }

  async function sendChat(event) {
    event.preventDefault();
    const input = document.getElementById("liveChatInput");
    if (!input?.value.trim()) return;

    try {
      await apiRequest(`/live/sessions/${session.id}/chat`, {
        method: "POST",
        body: JSON.stringify({ content: input.value.trim() }),
      });
      input.value = "";
    } catch (error) {
      if (typeof showAlert === "function") {
        showAlert(error.message, "error", 3600);
      }
    }
  }

  async function sendQuestion(event) {
    event.preventDefault();
    const input = document.getElementById("liveQuestionInput");
    if (!input?.value.trim()) return;

    try {
      const payload = await apiRequest(`/live/sessions/${session.id}/questions`, {
        method: "POST",
        body: JSON.stringify({ content: input.value.trim() }),
      });
      upsertQuestion(payload.question);
      input.value = "";
    } catch (error) {
      if (typeof showAlert === "function") {
        showAlert(error.message, "error", 3600);
      }
    }
  }

  async function startLive() {
    try {
      const payload = await apiRequest(`/live/sessions/${session.id}/start`, { method: "POST" });
      session.status = payload.session.status;
      setStatusBadge(payload.session.statusLabel, payload.session.statusTone);
      updateModeratorButtons(payload.session.status);
      await ensureRoomConnection();
    } catch (error) {
      if (typeof showAlert === "function") {
        showAlert(error.message, "error", 3600);
      }
    }
  }

  async function endLive() {
    try {
      const payload = await apiRequest(`/live/sessions/${session.id}/end`, { method: "POST" });
      session.status = payload.session.status;
      setStatusBadge(payload.session.statusLabel, payload.session.statusTone);
      updateModeratorButtons(payload.session.status);
      clearInterval(attendanceTimer);
      setConnectionState("Đã kết thúc");
      setStageState("Buổi live đã kết thúc", "Bạn có thể chuyển sang tab replay để xem lại.");
    } catch (error) {
      if (typeof showAlert === "function") {
        showAlert(error.message, "error", 3600);
      }
    }
  }

  async function toggleScreenShare() {
    if (!room || !room.localParticipant) {
      if (typeof showAlert === "function") {
        showAlert("Chưa kết nối vào phòng media.", "error", 3000);
      }
      return;
    }

    try {
      if (isScreenSharing) {
        await room.localParticipant.setScreenShareEnabled(false);
        isScreenSharing = false;
        if (elements.screenShareButton) {
          elements.screenShareButton.innerHTML = '<i class="fas fa-desktop"></i> Chia sẻ màn hình';
          elements.screenShareButton.classList.remove("live-room-btn--active");
        }
        if (elements.screenShareContainer) {
          elements.screenShareContainer.querySelectorAll("video").forEach((v) => v.remove());
          elements.screenShareContainer.hidden = true;
        }
        if (typeof showAlert === "function") {
          showAlert("Đã tắt chia sẻ màn hình.", "info", 2000);
        }
      } else {
        await room.localParticipant.setScreenShareEnabled(true);
        isScreenSharing = true;
        if (elements.screenShareButton) {
          elements.screenShareButton.innerHTML = '<i class="fas fa-stop"></i> Dừng chia sẻ';
          elements.screenShareButton.classList.add("live-room-btn--active");
        }
        if (typeof showAlert === "function") {
          showAlert("Đang chia sẻ màn hình của bạn.", "success", 2000);
        }
      }
    } catch (error) {
      isScreenSharing = false;
      if (elements.screenShareButton) {
        elements.screenShareButton.innerHTML = '<i class="fas fa-desktop"></i> Chia sẻ màn hình';
        elements.screenShareButton.classList.remove("live-room-btn--active");
      }
      console.warn("Screen share error:", error);
      if (typeof showAlert === "function") {
        showAlert("Không thể chia sẻ màn hình: " + (error.message || "User đã hủy."), "error", 3600);
      }
    }
  }

  async function toggleHand() {
    try {
      const payload = await apiRequest(`/live/sessions/${session.id}/hands`, {
        method: "POST",
      });
      upsertHand(payload.hand);
      if (typeof showAlert === "function") {
        showAlert(
          payload.hand.action === "lowered" ? "Đã hạ tay." : "Bạn đã giơ tay trong phòng.",
          "info",
          2800
        );
      }
    } catch (error) {
      if (typeof showAlert === "function") {
        showAlert(error.message, "error", 3600);
      }
    }
  }

  async function moderateQuestion(questionId, status) {
    try {
      const payload = await apiRequest(`/live/sessions/${session.id}/questions/${questionId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      upsertQuestion(payload.question);
    } catch (error) {
      if (typeof showAlert === "function") showAlert(error.message, "error", 3600);
    }
  }

  async function moderateHand(handId, status) {
    try {
      const payload = await apiRequest(`/live/sessions/${session.id}/hands/${handId}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      upsertHand(payload.hand);
    } catch (error) {
      if (typeof showAlert === "function") showAlert(error.message, "error", 3600);
    }
  }

  function initTabs() {
    document.querySelectorAll(".live-side-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const panelName = button.dataset.livePanel;
        document.querySelectorAll(".live-side-tab").forEach((node) => node.classList.remove("is-active"));
        document.querySelectorAll(".live-side-panel").forEach((node) => node.classList.remove("is-active"));
        button.classList.add("is-active");
        const panel = document.querySelector(`[data-live-panel-view="${panelName}"]`);
        if (panel) panel.classList.add("is-active");
      });
    });
  }

  function initSocket() {
    if (typeof io === "undefined") return;
    socket = io();
    socket.on("connect", () => {
      if (currentUser.id) {
        socket.emit("userConnect", currentUser.id);
      }
      socket.emit("join_live_session", {
        sessionId: session.id,
        user: currentUser,
      });
    });

    socket.on("livePresenceUpdate", renderPeople);
    socket.on("liveChatMessage", appendChatMessage);
    socket.on("liveQuestionUpdate", upsertQuestion);
    socket.on("liveHandUpdate", upsertHand);
    socket.on("liveSessionUpdated", async (payload) => {
      if (!payload) return;
      session.status = payload.status;
      setStatusBadge(payload.statusLabel, payload.statusTone);
      if (elements.viewerCount) elements.viewerCount.textContent = payload.viewerCount || 0;
      if (elements.peakCount) elements.peakCount.textContent = payload.viewerPeak || 0;
      updateModeratorButtons(payload.status);
      if (payload.status === "live") {
        await ensureRoomConnection();
      }
      if (payload.status === "ended") {
        clearInterval(attendanceTimer);
        setConnectionState("Đã kết thúc");
        setStageState("Buổi live đã kết thúc", "Replay và snapshot sẽ ở ngay trong app.");
      }
    });
  }

  document.addEventListener("click", (event) => {
    const questionButton = event.target.closest(".js-question-status");
    if (questionButton) {
      moderateQuestion(questionButton.dataset.questionId, questionButton.dataset.status);
      return;
    }

    const handButton = event.target.closest(".js-hand-status");
    if (handButton) {
      moderateHand(handButton.dataset.handId, handButton.dataset.status);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && session.status === "live") {
      pingAttendance();
    }
  });

  window.addEventListener("beforeunload", () => {
    clearInterval(attendanceTimer);
    if (socket) {
      socket.emit("leave_live_session");
    }
    if (room) {
      room.disconnect(true);
    }
    localTracks.forEach((track) => track.stop && track.stop());
  });

  elements.chatForm?.addEventListener("submit", sendChat);
  elements.questionForm?.addEventListener("submit", sendQuestion);
  elements.startButton?.addEventListener("click", startLive);
  elements.endButton?.addEventListener("click", endLive);
  elements.raiseHandButton?.addEventListener("click", toggleHand);
  elements.screenShareButton?.addEventListener("click", toggleScreenShare);

  initTabs();
  initSocket();
  updateModeratorButtons(session.status);
  ensureRoomConnection();
});
