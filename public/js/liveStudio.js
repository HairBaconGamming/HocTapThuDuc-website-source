document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("liveStudioForm");
  const titleInput = document.getElementById("liveTitle");
  const previewTitle = document.getElementById("previewTitle");
  const scheduleField = document.getElementById("scheduleField");
  const courseField = document.getElementById("courseField");
  const lessonField = document.getElementById("lessonField");
  const submitButton = document.getElementById("liveStudioSubmit");
  const previewFallback = document.getElementById("previewFallback");
  const previewVideo = document.getElementById("localVideoPreview");
  const deviceStatus = document.getElementById("deviceStatus");
  const micLevel = document.getElementById("micLevel");
  let previewStream = null;

  const subjectSelect = document.getElementById("subjectId");
  const courseSelect = document.getElementById("courseId");
  const lessonSelect = document.getElementById("lessonId");

  function syncLayout() {
    const sessionMode = getSelectedValue("sessionMode");
    scheduleField.hidden = sessionMode !== "scheduled";
  }

  function handleSubjectChange() {
    const subjectId = subjectSelect.value;
    
    // Reset and filter courses
    courseSelect.value = "";
    lessonSelect.value = "";
    lessonField.hidden = true;

    if (!subjectId) {
      courseField.hidden = true;
      return;
    }

    courseField.hidden = false;
    Array.from(courseSelect.options).forEach(option => {
      if (!option.value) return; // Skip placeholder
      const isMatch = option.dataset.subject === subjectId;
      option.hidden = !isMatch;
    });
  }

  function handleCourseChange() {
    const courseId = courseSelect.value;
    
    // Reset and filter lessons
    lessonSelect.value = "";

    if (!courseId) {
      lessonField.hidden = true;
      return;
    }

    lessonField.hidden = false;
    Array.from(lessonSelect.options).forEach(option => {
      if (!option.value) return; // Skip placeholder
      const isMatch = option.dataset.course === courseId;
      option.hidden = !isMatch;
    });
  }

  function syncPreviewTitle() {
    previewTitle.textContent = titleInput.value.trim() || "Tên buổi live sẽ hiện ở đây";
  }

  async function initPreviewMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      deviceStatus.textContent = "Thiết bị không hỗ trợ preview camera.";
      return;
    }

    try {
      previewStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      previewVideo.srcObject = previewStream;
      previewFallback.hidden = true;
      deviceStatus.textContent = "Thiết bị đã sẵn sàng.";

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(previewStream);
      const processor = audioContext.createScriptProcessor(2048, 1, 1);

      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;

      microphone.connect(analyser);
      analyser.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = () => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length);
        micLevel.style.height = `${Math.min(100, Math.max(10, average * 1.6))}%`;
      };
    } catch (error) {
      previewFallback.hidden = false;
      deviceStatus.textContent = "Chưa cấp quyền camera/micro. Vẫn có thể tạo phiên live.";
    }
  }

  async function submitStudio(event) {
    event.preventDefault();
    submitButton.disabled = true;
    submitButton.innerHTML = "<span>Đang tạo phiên...</span>";

    try {
      const cId = courseSelect.value;
      const lId = lessonSelect.value;
      
      // Calculate bindingType
      let bType = "";
      if (lId) bType = "lesson";
      else if (cId) bType = "course";

      const payload = {
        title: titleInput.value.trim(),
        description: document.getElementById("liveDescription").value.trim(),
        category: document.getElementById("liveCategory").value,
        thumbnail: document.getElementById("liveThumbnail").value.trim(),
        sessionMode: getSelectedValue("sessionMode"),
        bindingType: bType,
        courseId: cId,
        lessonId: lId,
        scheduledFor: document.getElementById("scheduledFor").value,
      };

      const response = await fetch("/live/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Không thể tạo phiên live.");
      }

      if (previewStream) {
        previewStream.getTracks().forEach((track) => track.stop());
      }

      window.location.href = result.redirectUrl || "/live";
    } catch (error) {
      submitButton.disabled = false;
      submitButton.innerHTML = "<span>Tạo phiên live</span>";
      if (typeof showAlert === "function") {
        showAlert(error.message, "error", 4200);
      } else {
        alert(error.message);
      }
    }
  }

  form.querySelectorAll('input[name="sessionMode"]').forEach((input) => {
    input.addEventListener("change", syncLayout);
  });
  
  subjectSelect.addEventListener("change", handleSubjectChange);
  courseSelect.addEventListener("change", handleCourseChange);

  titleInput.addEventListener("input", syncPreviewTitle);
  form.addEventListener("submit", submitStudio);

  syncLayout();
  syncPreviewTitle();
  initPreviewMedia();
});
