// MyScriptDocs - App Core JS Logic

// State variables
let openaiKey = '';
let googleClientId = '';
let vocabLevel = 'middle_school';
let splitDuration = 15;
let accessToken = null;
let tokenClient = null;
let capturedNetflixData = null;
let activeTab = 'youtube';

// DOM Elements
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const modalSettings = document.getElementById('modal-settings');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const btnGoogleLogin = document.getElementById('btn-google-login');
const btnGoogleLogout = document.getElementById('btn-google-logout');
const googleUserInfo = document.getElementById('google-user-info');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');

const youtubeUrlInput = document.getElementById('youtube-url');
const manualTitleInput = document.getElementById('manual-title');
const manualTextInput = document.getElementById('manual-text');
const btnProcess = document.getElementById('btn-process');

const processSpinner = document.getElementById('process-spinner');
const processCheckmark = document.getElementById('process-checkmark');
const statusHeadline = document.getElementById('status-headline');
const progressBar = document.getElementById('progress-bar');
const logConsole = document.getElementById('log-console');
const outputBox = document.getElementById('output-box');
const documentLinksList = document.getElementById('document-links-list');

// Initialize app
window.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  setupEventListeners();
  checkStoredGoogleToken();
  checkProcessButtonState();
});

// Load Settings from LocalStorage
function loadSettings() {
  openaiKey = localStorage.getItem('openai_key') || '';
  googleClientId = localStorage.getItem('google_client_id') || '';
  vocabLevel = localStorage.getItem('vocab_level') || 'middle_school';
  splitDuration = parseInt(localStorage.getItem('split_duration') || '15', 10);

  document.getElementById('setting-openai-key').value = openaiKey;
  document.getElementById('setting-google-client-id').value = googleClientId;
  document.getElementById('setting-vocabulary-level').value = vocabLevel;
  document.getElementById('setting-split-duration').value = splitDuration;

  if (googleClientId) {
    initGoogleAuth();
  } else {
    log("구글 Client ID가 설정되지 않았습니다. 설정(⚙️) 메뉴에서 입력해 주세요.", "system");
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Settings modal
  btnSettings.addEventListener('click', () => modalSettings.classList.remove('hidden'));
  btnCloseSettings.addEventListener('click', () => modalSettings.classList.add('hidden'));
  modalSettings.addEventListener('click', (e) => {
    if (e.target === modalSettings) modalSettings.classList.add('hidden');
  });

  btnSaveSettings.addEventListener('click', () => {
    const key = document.getElementById('setting-openai-key').value.trim();
    const cid = document.getElementById('setting-google-client-id').value.trim();
    const lvl = document.getElementById('setting-vocabulary-level').value;
    const dur = parseInt(document.getElementById('setting-split-duration').value, 10);

    localStorage.setItem('openai_key', key);
    localStorage.setItem('google_client_id', cid);
    localStorage.setItem('vocab_level', lvl);
    localStorage.setItem('split_duration', dur);

    openaiKey = key;
    googleClientId = cid;
    vocabLevel = lvl;
    splitDuration = dur;

    log("설정이 저장되었습니다.", "success");
    modalSettings.classList.add('hidden');

    if (googleClientId) {
      initGoogleAuth();
    }
    checkProcessButtonState();
  });

  // Tabs
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      activeTab = btn.dataset.tab.replace('tab-', '');
      document.getElementById(btn.dataset.tab).classList.add('active');

      log(`입력 탭 전환: ${btn.textContent}`, "info");
      checkProcessButtonState();
    });
  });

  // Input listeners to enable/disable process button
  youtubeUrlInput.addEventListener('input', checkProcessButtonState);
  manualTitleInput.addEventListener('input', checkProcessButtonState);
  manualTextInput.addEventListener('input', checkProcessButtonState);

  // Google Login / Logout
  btnGoogleLogin.addEventListener('click', () => {
    if (!googleClientId) {
      alert("Google Client ID가 필요합니다. 설정(⚙️) 버튼을 눌러 Client ID를 먼저 저장해 주세요.");
      modalSettings.classList.remove('hidden');
      return;
    }
    if (!tokenClient) {
      initGoogleAuth();
    }
    tokenClient.requestAccessToken();
  });

  btnGoogleLogout.addEventListener('click', () => {
    accessToken = null;
    localStorage.removeItem('google_access_token');
    
    btnGoogleLogin.classList.remove('hidden');
    googleUserInfo.classList.add('hidden');
    
    log("구글 로그아웃 완료.", "info");
    checkProcessButtonState();
  });

  // Listen for Netflix subtitles from the extension via postMessage (sent by webapp_relay.js)
  window.addEventListener('message', (event) => {
    // Only accept messages from our own window
    if (event.source !== window) return;

    if (event.data && event.data.type === 'MYSCRIPT_DOCS_NETFLIX_SUBTITLES') {
      const { title, cues } = event.data;
      capturedNetflixData = { title, cues };

      // Update Netflix status view
      document.getElementById('netflix-capture-status').innerHTML = `
        <span class="indicator-dot green"></span>
        <span class="status-text">넷플릭스 자막 수신 완료!</span>
      `;
      
      const captureInfo = document.getElementById('netflix-captured-info');
      captureInfo.classList.remove('hidden');
      document.getElementById('netflix-title').textContent = title;
      document.getElementById('netflix-cues-count').textContent = `${cues.length}개 자막 대사 로드됨`;

      log(`확장프로그램으로부터 넷플릭스 자막 수신 완료: "${title}" (${cues.length}개 대사)`, "success");
      
      // Auto-switch to Netflix tab for convenience
      const netflixTabBtn = Array.from(tabBtns).find(b => b.dataset.tab === 'tab-netflix');
      if (netflixTabBtn) netflixTabBtn.click();

      checkProcessButtonState();
    }
  });

  // Action process button
  btnProcess.addEventListener('click', processConversion);
}

// Check if we have an active access token stored in localStorage
async function checkStoredGoogleToken() {
  const storedToken = localStorage.getItem('google_access_token');
  if (storedToken) {
    log("기존 구글 인증 토큰 확인 중...", "info");
    accessToken = storedToken;
    await fetchGoogleUserInfo(storedToken);
  }
}

// Initialize Google OAuth Token Client
function initGoogleAuth() {
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: 'https://www.googleapis.com/auth/drive.file profile email',
      callback: async (tokenResponse) => {
        if (tokenResponse.error !== undefined) {
          log(`구글 로그인 에러: ${tokenResponse.error}`, "error");
          return;
        }
        accessToken = tokenResponse.access_token;
        localStorage.setItem('google_access_token', accessToken);
        log("구글 인증 성공!", "success");
        await fetchGoogleUserInfo(accessToken);
      },
    });
  } catch (err) {
    console.error("GSI Init error:", err);
    log(`구글 로그인 라이브러리 초기화 실패: ${err.message}`, "error");
  }
}

// Fetch Google User Profile Info to display in UI
async function fetchGoogleUserInfo(token) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      showGoogleUserInfo(data);
    } else {
      // Token probably expired
      accessToken = null;
      localStorage.removeItem('google_access_token');
      log("구글 로그인 세션이 만료되었습니다. 다시 로그인해 주세요.", "system");
      checkProcessButtonState();
    }
  } catch (err) {
    console.error("UserInfo fetch error:", err);
    accessToken = null;
    checkProcessButtonState();
  }
}

// Display Google profile info in UI
function showGoogleUserInfo(info) {
  btnGoogleLogin.classList.add('hidden');
  googleUserInfo.classList.remove('hidden');

  if (info.picture) {
    userAvatar.innerHTML = `<img src="${info.picture}" referrerPolicy="no-referrer" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
  } else {
    userAvatar.textContent = "👤";
  }

  userName.textContent = info.name || "사용자";
  userEmail.textContent = info.email || "-";

  log(`구글 계정 연결됨: ${info.name} (${info.email})`, "info");
  checkProcessButtonState();
}

// Toggle Process button state based on inputs
function checkProcessButtonState() {
  let isDataReady = false;

  if (activeTab === 'youtube') {
    const url = youtubeUrlInput.value.trim();
    isDataReady = url.length > 0;
  } else if (activeTab === 'netflix') {
    isDataReady = capturedNetflixData !== null;
  } else if (activeTab === 'manual') {
    const text = manualTextInput.value.trim();
    isDataReady = text.length > 0;
  }

  const isAuthReady = accessToken !== null;
  btnProcess.disabled = !(isDataReady && isAuthReady);
}

// Logger utility
function log(msg, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  
  const time = new Date().toLocaleTimeString();
  entry.innerHTML = `<span class="log-time">[${time}]</span> ${msg}`;
  
  logConsole.appendChild(entry);
  logConsole.scrollTop = logConsole.scrollHeight;
}

// Progress UI controls
function showProgress(percent, text, state = 'running') {
  progressBar.style.width = `${percent}%`;
  statusHeadline.textContent = text;

  if (state === 'running') {
    processSpinner.classList.remove('hidden');
    processCheckmark.classList.add('hidden');
  } else if (state === 'success') {
    processSpinner.classList.add('hidden');
    processCheckmark.classList.remove('hidden');
    progressBar.style.backgroundColor = '#10b981'; // Green
  } else if (state === 'error') {
    processSpinner.classList.add('hidden');
    processCheckmark.classList.add('hidden');
    progressBar.style.backgroundColor = '#ef4444'; // Red
  }
}

// Format seconds into MM:SS or HH:MM:SS
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');

  if (h > 0) {
    const hStr = String(h).padStart(2, '0');
    return `${hStr}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

// Parser for manual transcript input
function parseManualText(text) {
  const lines = text.split('\n');
  const cues = [];
  let currentTime = 0;

  // Pattern: matching mm:ss, [mm:ss], hh:mm:ss, or [hh:mm:ss]
  const timeRegex = /(?:\[)?(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:\.(\d{3}))?(?:\])?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const timeMatch = line.match(timeRegex);
    let start = currentTime;
    let dialogue = line;

    if (timeMatch) {
      const hours = timeMatch[1] ? parseInt(timeMatch[1], 10) : 0;
      const minutes = parseInt(timeMatch[2], 10);
      const seconds = parseInt(timeMatch[3], 10);
      const ms = timeMatch[4] ? parseInt(timeMatch[4], 10) : 0;
      
      start = hours * 3600 + minutes * 60 + seconds + ms / 1000;
      currentTime = start;
      
      // Strip timestamp from dialogue text
      dialogue = line.replace(timeMatch[0], '').trim();
    } else {
      // Auto-increment by 4 seconds if no time marker is found
      currentTime += 4;
    }

    // Clean up empty lines or non-dialogue
    if (dialogue) {
      cues.push({
        start: start,
        duration: 4,
        text: dialogue
      });
    }
  }

  // Sort by timeline
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

// Convert Hex Color to Google Docs Float RGB Format
function hexToRgbColor(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return { red: r, green: g, blue: b };
}

// Google Docs API Request Builder Helper
class DocBuilder {
  constructor() {
    this.requests = [];
    this.currentIndex = 1; // Google Docs indices are 1-based
  }

  insertText(text, style = null) {
    if (!text) return;
    const start = this.currentIndex;
    
    this.requests.push({
      insertText: {
        text: text,
        location: { index: start }
      }
    });
    
    const len = text.length;
    this.currentIndex += len;

    if (style) {
      const fields = Object.keys(style).join(',');
      this.requests.push({
        updateTextStyle: {
          textStyle: style,
          fields: fields,
          range: {
            startIndex: start,
            endIndex: start + len
          }
        }
      });
    }
  }

  insertHeading(text, level) {
    const start = this.currentIndex;
    this.insertText(text + "\n");
    const end = this.currentIndex - 1; // Exclude the newline

    let fontSize = 11;
    let bold = false;
    let color = hexToRgbColor('#111827');
    let namedStyle = 'NORMAL_TEXT';

    if (level === 1) {
      fontSize = 22;
      bold = true;
      color = hexToRgbColor('#6366f1'); // Indigo/Violet
      namedStyle = 'HEADING_1';
    } else if (level === 2) {
      fontSize = 15;
      bold = true;
      color = hexToRgbColor('#6366f1'); // Indigo
      namedStyle = 'HEADING_2';
    } else if (level === 3) {
      fontSize = 12;
      bold = true;
      color = hexToRgbColor('#3b82f6'); // Blue accent
      namedStyle = 'HEADING_3';
    }

    // Apply header text styles
    this.requests.push({
      updateTextStyle: {
        textStyle: {
          fontSize: { magnitude: fontSize, unit: 'PT' },
          bold: bold,
          foregroundColor: { color: { rgbColor: color } },
          weightedFontFamily: { fontFamily: 'Outfit', weight: bold ? 700 : 400 }
        },
        fields: 'fontSize,bold,foregroundColor,weightedFontFamily',
        range: {
          startIndex: start,
          endIndex: end
        }
      }
    });

    // Apply paragraph spacing and styling
    this.requests.push({
      updateParagraphStyle: {
        paragraphStyle: {
          namedStyleType: namedStyle,
          spaceBefore: { magnitude: level === 1 ? 0 : 16, unit: 'PT' },
          spaceAfter: { magnitude: 8, unit: 'PT' }
        },
        fields: 'namedStyleType,spaceBefore,spaceAfter',
        range: {
          startIndex: start,
          endIndex: end + 1 // Include newline to apply paragraph style
        }
      }
    });
  }

  insertImage(url) {
    const start = this.currentIndex;
    this.requests.push({
      insertInlineImage: {
        uri: url,
        location: { index: start },
        objectSize: {
          width: { magnitude: 450, unit: 'PT' },
          height: { magnitude: 253, unit: 'PT' } // 16:9 aspect ratio
        }
      }
    });
    this.currentIndex += 1;
    this.insertText("\n");
  }

  insertDivider() {
    const start = this.currentIndex;
    // Create a beautiful thin divider using underscores
    this.insertText("_________________________________________________________________\n", {
      foregroundColor: { color: { rgbColor: hexToRgbColor('#e5e7eb') } },
      fontSize: { magnitude: 10, unit: 'PT' }
    });
    
    this.requests.push({
      updateParagraphStyle: {
        paragraphStyle: {
          alignment: 'CENTER',
          spaceBefore: { magnitude: 8, unit: 'PT' },
          spaceAfter: { magnitude: 14, unit: 'PT' }
        },
        fields: 'alignment,spaceBefore,spaceAfter',
        range: {
          startIndex: start,
          endIndex: this.currentIndex
        }
      }
    });
  }

  indentParagraphs(start, end, indentPt) {
    this.requests.push({
      updateParagraphStyle: {
        paragraphStyle: {
          indentLeft: { magnitude: indentPt, unit: 'PT' }
        },
        fields: 'indentLeft',
        range: {
          startIndex: start,
          endIndex: end
        }
      }
    });
  }
}

// Send cues to OpenAI for translation, vocab processing and chaptering
async function callOpenAIProcessing(cues, partIndex, totalParts, vocabLvl) {
  if (!openaiKey) {
    throw new Error("OpenAI API 키가 필요합니다. 설정 메뉴에서 먼저 키를 등록해 주세요.");
  }

  // Format cues list into a compressed text format for token efficiency
  let cuesText = cues.map(c => `[${formatTime(c.start)}] ${c.text}`).join('\n');

  let targetVocabDescription = '';
  if (vocabLvl === 'easy') {
    targetVocabDescription = '초등학교 수준 이상의 기초 영단어 중, 일상 회화에서 요긴하지만 학습이 필요한 단어 5~7개 추출';
  } else if (vocabLvl === 'middle_school') {
    targetVocabDescription = '중학교 기본 영단어 수준 이상의 실생활 구어/어휘/숙어 중 회화 훈련에 꼭 필요한 핵심 표현 6~8개 추출 (구어적 표현 및 일상 숙어 우대)';
  } else if (vocabLvl === 'high_school') {
    targetVocabDescription = '고등학교/수능/비즈니스 수준 이상의 고급 단어, 학술 용어 또는 격식 있는 영단어/숙어 8~10개 추출';
  }

  const systemPrompt = `You are a professional English education AI assistant.
Your task is to analyze the provided English video transcript (subtitles with start times) for Part ${partIndex}/${totalParts}, translate the dialogue into natural, flowing Korean, and extract key vocabulary to help Korean speakers study English conversation.

You must partition this transcript segment into logical chapters (typically 2 to 4 chapters per 15-minute file). Each chapter should represent a distinct discussion topic or video scene.

For each chapter, provide:
1. Chapter Number, title in Korean (e.g., "1. 시간 낭비의 실상과 위기감"), and start/end times.
2. An array of selected vocabulary/phrases based on this instruction: "${targetVocabDescription}".
   - For each word/phrase, provide: the English word/phrase, its Korean definition, a custom English example sentence utilizing it, and the Korean translation of that example.
3. The bilingual dialogue text, line-by-line. Map each original timestamp to its English dialogue line and its Korean translation. Ensure the translations sound natural in context.

You must respond with a strictly structured JSON object. Do not include markdown code block syntax (like \`\`\`json). The JSON output must follow this format:
{
  "partSummary": "A brief overview summary (2-3 sentences in Korean) of this video segment.",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter Title in Korean",
      "startTime": "MM:SS or HH:MM:SS",
      "endTime": "MM:SS or HH:MM:SS",
      "vocabulary": [
        {
          "word": "word or idiom",
          "meaning": "Korean meaning",
          "example": "An English example sentence containing this word.",
          "exampleTranslation": "Example sentence Korean translation."
        }
      ],
      "bilingualScript": [
        {
          "time": "MM:SS",
          "text": "Original English line",
          "translation": "Translated Korean line"
        }
      ]
    }
  ]
}`;

  log(`[Part ${partIndex}] OpenAI AI 분석 및 자막 번역 처리 중...`, "info");

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the transcript for Part ${partIndex}:\n\n${cuesText}` }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    const errMsg = errObj.error?.message || response.statusText;
    throw new Error(`OpenAI API 에러: ${errMsg}`);
  }

  const resultData = await response.json();
  const parsedContent = JSON.parse(resultData.choices[0].message.content);
  return parsedContent;
}

// Send cues to ChatGPT Web UI automation via Chrome Extension
async function callChatGPTAutomation(cues, partIndex, totalParts, vocabLvl) {
  return new Promise((resolve, reject) => {
    // Generate a unique ID to match the response
    const requestId = Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    
    // Response handler
    const responseHandler = (event) => {
      if (event.source !== window) return;
      if (event.data && event.data.type === 'MYSCRIPT_DOCS_CHATGPT_RESPONSE' && event.data.requestId === requestId) {
        window.removeEventListener('message', responseHandler);
        
        const { success, result, error } = event.data;
        if (success) {
          log(`[Part ${partIndex}] ChatGPT 번역 및 학습 분석 완료!`, "success");
          resolve(result);
        } else {
          reject(new Error(error || "ChatGPT 자동화 처리 중 오류가 발생했습니다."));
        }
      }
    };
    
    window.addEventListener('message', responseHandler);
    
    // Format cues list into a compressed text format for token efficiency
    let cuesText = cues.map(c => `[${formatTime(c.start)}] ${c.text}`).join('\n');
    
    let targetVocabDescription = '';
    if (vocabLvl === 'easy') {
      targetVocabDescription = '초등학교 수준 이상의 기초 영단어 중, 일상 회화에서 요긴하지만 학습이 필요한 단어 5~7개 추출';
    } else if (vocabLvl === 'middle_school') {
      targetVocabDescription = '중학교 기본 영단어 수준 이상의 실생활 구어/어휘/숙어 중 회화 훈련에 꼭 필요한 핵심 표현 6~8개 추출 (구어적 표현 및 일상 숙어 우대)';
    } else if (vocabLvl === 'high_school') {
      targetVocabDescription = '고등학교/수능/비즈니스 수준 이상의 고급 단어, 학술 용어 또는 격식 있는 영단어/숙어 8~10개 추출';
    }
    
    const systemPrompt = `You are a professional English education AI assistant.
Your task is to analyze the provided English video transcript (subtitles with start times) for Part ${partIndex}/${totalParts}, translate the dialogue into natural, flowing Korean, and extract key vocabulary to help Korean speakers study English conversation.

You must partition this transcript segment into logical chapters (typically 2 to 4 chapters per 15-minute file). Each chapter should represent a distinct discussion topic or video scene.

For each chapter, provide:
1. Chapter Number, title in Korean (e.g., "1. 시간 낭비의 실상과 위기감"), and start/end times.
2. An array of selected vocabulary/phrases based on this instruction: "${targetVocabDescription}".
   - For each word/phrase, provide: the English word/phrase, its Korean definition, a custom English example sentence utilizing it, and the Korean translation of that example.
3. The bilingual dialogue text, line-by-line. Map each original timestamp to its English dialogue line and its Korean translation. Ensure the translations sound natural in context.

You must respond with a strictly structured JSON object. Wrap it in a JSON markdown code block (like \`\`\`json ... \`\`\`). Do not output any other conversational text. The JSON output must follow this format:
{
  "partSummary": "A brief overview summary (2-3 sentences in Korean) of this video segment.",
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "Chapter Title in Korean",
      "startTime": "MM:SS or HH:MM:SS",
      "endTime": "MM:SS or HH:MM:SS",
      "vocabulary": [
        {
          "word": "word or idiom",
          "meaning": "Korean meaning",
          "example": "An English example sentence containing this word.",
          "exampleTranslation": "Example sentence Korean translation."
        }
      ],
      "bilingualScript": [
        {
          "time": "MM:SS",
          "text": "Original English line",
          "translation": "Translated Korean line"
        }
      ]
    }
  ]
}`;
    
    log(`[Part ${partIndex}] 확장프로그램을 통해 ChatGPT 자동화 요청 전송 중... (백그라운드 탭이 가동됩니다)`, "info");
    
    // Post request to relay script webapp_relay.js
    window.postMessage({
      type: 'MYSCRIPT_DOCS_CHATGPT_REQUEST',
      requestId,
      systemPrompt,
      userContent: `Here is the transcript for Part ${partIndex}:\n\n${cuesText}`
    }, '*');
  });
}

// Create Folder and Document inside user's Google Drive
async function saveToGoogleDocs(title, videoId, aiResult, partIndex, totalParts) {
  log(`[Part ${partIndex}] 구글 드라이브 폴더 생성 또는 조회 중...`, "info");
  
  // 1. Check or create "MyScriptDocs" folder
  let folderId = null;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='MyScriptDocs' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  
  const searchRes = await fetch(searchUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!searchRes.ok) {
    throw new Error(`구글 드라이브 검색 실패: ${searchRes.statusText}`);
  }
  
  const searchData = await searchRes.json();
  
  if (searchData.files && searchData.files.length > 0) {
    folderId = searchData.files[0].id;
  } else {
    // Create folder
    const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'MyScriptDocs',
        mimeType: 'application/vnd.google-apps.folder'
      })
    });
    
    if (!createFolderRes.ok) {
      throw new Error(`구글 드라이브 폴더 생성 실패: ${createFolderRes.statusText}`);
    }
    
    const folderData = await createFolderRes.json();
    folderId = folderData.id;
    log("구글 드라이브에 'MyScriptDocs' 새 폴더를 생성했습니다.", "success");
  }

  // 2. Create blank Document inside that folder
  log(`[Part ${partIndex}] 구글 문서 파일 생성 중...`, "info");
  const docTitle = `[MyScriptDocs] ${title} - Part ${partIndex}/${totalParts}`;
  
  const docCreateRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: docTitle,
      mimeType: 'application/vnd.google-apps.document',
      parents: [folderId]
    })
  });

  if (!docCreateRes.ok) {
    throw new Error(`구글 문서 생성 실패: ${docCreateRes.statusText}`);
  }

  const docData = await docCreateRes.json();
  const docId = docData.id;

  // 3. Build Google Doc styled request content
  log(`[Part ${partIndex}] 학습 서식 지정 및 내용 작성 중...`, "info");
  const builder = new DocBuilder();

  // Document Header
  builder.insertHeading(docTitle, 1);
  builder.insertText(`동영상 소스: ${activeTab.toUpperCase()} | 변환 일시: ${new Date().toLocaleString()}\n`, {
    italic: true,
    fontSize: { magnitude: 9.5, unit: 'PT' },
    foregroundColor: { color: { rgbColor: hexToRgbColor('#9ca3af') } }
  });

  // Embed YouTube Video Thumbnail if active
  if (activeTab === 'youtube' && videoId) {
    builder.insertImage(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
  }

  builder.insertDivider();

  // Part Summary
  builder.insertHeading("요약 (Summary)", 2);
  builder.insertText(aiResult.partSummary + "\n\n", {
    italic: true,
    fontSize: { magnitude: 11, unit: 'PT' },
    foregroundColor: { color: { rgbColor: hexToRgbColor('#374151') } } // Charcoal gray
  });

  builder.insertDivider();

  // Chapters & Vocab & Dialogues
  aiResult.chapters.forEach(chapter => {
    builder.insertHeading(`Chapter ${chapter.chapterNumber}: ${chapter.title} (${chapter.startTime} ~ ${chapter.endTime})`, 2);
    
    // Vocabulary section
    builder.insertHeading("주요 표현 & 어휘 학습 (Key Vocabulary)", 3);
    const vocabStart = builder.currentIndex;
    
    chapter.vocabulary.forEach(v => {
      builder.insertText("▶ ");
      builder.insertText(v.word, {
        bold: true,
        foregroundColor: { color: { rgbColor: hexToRgbColor('#6366f1') } }, // Indigo/Violet
        fontSize: { magnitude: 11, unit: 'PT' }
      });
      builder.insertText(` : ${v.meaning}\n`, {
        fontSize: { magnitude: 11, unit: 'PT' }
      });
      builder.insertText(`   예시: ${v.example}\n`, {
        italic: true,
        foregroundColor: { color: { rgbColor: hexToRgbColor('#6b7280') } }, // Muted Gray
        fontSize: { magnitude: 10, unit: 'PT' }
      });
      builder.insertText(`   해석: ${v.exampleTranslation}\n\n`, {
        foregroundColor: { color: { rgbColor: hexToRgbColor('#6b7280') } },
        fontSize: { magnitude: 10, unit: 'PT' }
      });
    });
    
    const vocabEnd = builder.currentIndex;
    builder.indentParagraphs(vocabStart, vocabEnd, 18); // Indent vocabulary text

    // Dialogue script section
    builder.insertHeading("이중 언어 자막 대사 (Bilingual Script)", 3);
    const scriptStart = builder.currentIndex;

    chapter.bilingualScript.forEach(line => {
      // Time marker
      builder.insertText(`[${line.time}] `, {
        bold: true,
        foregroundColor: { color: { rgbColor: hexToRgbColor('#06b6d4') } }, // Cyan
        fontSize: { magnitude: 10, unit: 'PT' }
      });
      // English text
      builder.insertText(line.text + "\n", {
        fontSize: { magnitude: 11, unit: 'PT' },
        foregroundColor: { color: { rgbColor: hexToRgbColor('#1f2937') } } // Dark Gray/Black
      });
      // Korean translation
      builder.insertText(`번역: ${line.translation}\n\n`, {
        fontSize: { magnitude: 10, unit: 'PT' },
        foregroundColor: { color: { rgbColor: hexToRgbColor('#059669') } } // Emerald Green
      });
    });

    const scriptEnd = builder.currentIndex;
    builder.indentParagraphs(scriptStart, scriptEnd, 18); // Indent script text
    
    builder.insertDivider();
  });

  // 4. Send requests queue to Google Docs API BatchUpdate
  const batchUrl = `https://documents.googleapis.com/v1/documents/${docId}:batchUpdate`;
  const docUpdateRes = await fetch(batchUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: builder.requests
    })
  });

  if (!docUpdateRes.ok) {
    const docUpdateErr = await docUpdateRes.json().catch(() => ({}));
    const errMsg = docUpdateErr.error?.message || docUpdateRes.statusText;
    throw new Error(`구글 문서 내용 작성 실패: ${errMsg}`);
  }

  log(`[Part ${partIndex}] 구글 학습 문서 작성 완료!`, "success");
  return {
    docId: docId,
    title: docTitle,
    url: `https://docs.google.com/document/d/${docId}/edit`
  };
}

// Core Controller Function: Coordinates data gathering, chunking, AI calls, and Docs creation
async function processConversion() {
  // Clear layout and reset progress states
  outputBox.classList.add('hidden');
  documentLinksList.innerHTML = '';
  processCheckmark.classList.add('hidden');
  processSpinner.classList.remove('hidden');
  progressBar.style.backgroundColor = '#6366f1';
  
  if (!openaiKey) {
    // Check if the user is on iPad/mobile device where Chrome Extensions cannot run
    const isMobile = /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || 
                     (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /Macintosh/i.test(navigator.userAgent));
    
    if (isMobile) {
      alert("아이패드(사파리/크롬) 환경에서는 크롬 확장프로그램을 실행할 수 없어 OpenAI API Key가 필수로 필요합니다. 설정(⚙️) 창에서 API 키를 입력해 주세요.");
      modalSettings.classList.remove('hidden');
      return;
    }
    
    log("설정된 API 키가 없으므로 크롬 확장프로그램 기반의 ChatGPT 무료 자동화 모드를 가동합니다.", "system");
  }
  
  if (!accessToken) {
    alert("구글 로그인이 필요합니다. 먼저 로그인 진행 후 시도해 주세요.");
    return;
  }

  btnProcess.disabled = true;
  let title = "자막 문서";
  let cues = [];
  let videoId = '';

  try {
    showProgress(5, "자막 데이터를 준비하는 중...", "running");

    // 1. Gather Subtitles based on active tab
    if (activeTab === 'youtube') {
      const url = youtubeUrlInput.value.trim();
      log(`유튜브 자막 수집 요청 중: ${url}`, "info");
      
      const serverRes = await fetch(`/api/youtube-transcript?url=${encodeURIComponent(url)}`);
      
      if (!serverRes.ok) {
        const errorData = await serverRes.json().catch(() => ({}));
        throw new Error(errorData.error || `서버 자막 수집 실패: ${serverRes.statusText}`);
      }
      
      const resData = await serverRes.json();
      title = resData.title || "YouTube Video";
      videoId = resData.videoId;
      cues = resData.transcript || [];
      
      log(`유튜브 자막 수집 성공! 동영상 제목: "${title}" (${cues.length}개 대사)`, "success");
      
    } else if (activeTab === 'netflix') {
      if (!capturedNetflixData) {
        throw new Error("넷플릭스 자막 데이터가 존재하지 않습니다. 확장프로그램에서 전송해 주세요.");
      }
      title = capturedNetflixData.title;
      cues = capturedNetflixData.cues;
      
      // Try to parse Netflix video ID from URL if stored
      if (capturedNetflixData.url) {
        const match = capturedNetflixData.url.match(/watch\/(\d+)/);
        if (match) videoId = match[1];
      }
      log(`넷플릭스 자막 파일 처리 개시: "${title}" (${cues.length}개 대사)`, "info");
      
    } else if (activeTab === 'manual') {
      const manualTitle = manualTitleInput.value.trim() || "직접 입력한 자막";
      const manualText = manualTextInput.value.trim();
      
      title = manualTitle;
      cues = parseManualText(manualText);
      
      log(`수동 입력 자막 파싱 완료: "${title}" (${cues.length}개 대사)`, "info");
    }

    if (cues.length === 0) {
      throw new Error("처리할 수 있는 자막 대사 목록이 비어 있습니다. 입력 값을 재확인해 주세요.");
    }

    // 2. Split cues into N-minute parts
    const partDurationSeconds = splitDuration * 60;
    const groupedParts = [];
    
    cues.forEach(cue => {
      const partIdx = Math.floor(cue.start / partDurationSeconds);
      if (!groupedParts[partIdx]) {
        groupedParts[partIdx] = [];
      }
      groupedParts[partIdx].push(cue);
    });

    // Remove empty part items in array
    const activeParts = groupedParts.filter(p => p && p.length > 0);
    const totalParts = activeParts.length;
    
    log(`동영상을 ${splitDuration}분 단위로 총 ${totalParts}개의 파트로 분할했습니다.`, "success");

    const createdDocs = [];

    // 3. Process each part sequentially to avoid API quota rate limits
    for (let i = 0; i < totalParts; i++) {
      const partNum = i + 1;
      const progressPercent = Math.round(((i) / totalParts) * 90) + 5; // spans 5% to 95%
      
      showProgress(progressPercent, `파트 ${partNum}/${totalParts} 처리 중...`, "running");
      log(`[Part ${partNum}/${totalParts}] 작업 시작...`, "info");

      // Translate & analyze using either API mode or ChatGPT automation mode
      let aiResult;
      if (openaiKey) {
        aiResult = await callOpenAIProcessing(activeParts[i], partNum, totalParts, vocabLevel);
      } else {
        aiResult = await callChatGPTAutomation(activeParts[i], partNum, totalParts, vocabLevel);
      }
      
      // Save data, format layout, upload to Google Docs
      const docInfo = await saveToGoogleDocs(title, videoId, aiResult, partNum, totalParts);
      
      createdDocs.push(docInfo);

      // Append completed document links to dashboard UI
      const linkEl = document.createElement('a');
      linkEl.href = docInfo.url;
      linkEl.target = "_blank";
      linkEl.className = "document-link";
      linkEl.innerHTML = `
        <span class="doc-icon">📄</span>
        <div class="doc-info">
          <p class="doc-name">${docInfo.title}</p>
          <p class="doc-url-text">문서 열기 ↗</p>
        </div>
      `;
      documentLinksList.appendChild(linkEl);
    }

    // 4. Completed successfully
    showProgress(100, "전체 문서 변환 완료!", "success");
    log(`[완료] 총 ${totalParts}개의 구글 학습 스크립트 문서 생성이 완료되었습니다.`, "success");
    outputBox.classList.remove('hidden');

  } catch (err) {
    console.error("Conversion error:", err);
    log(`[에러] 작업이 비정상 중단되었습니다: ${err.message}`, "error");
    showProgress(100, `오류 발생: ${err.message}`, "error");
  } finally {
    btnProcess.disabled = false;
  }
}
