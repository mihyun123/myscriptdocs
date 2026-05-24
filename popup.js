// MyScriptDocs Chrome Extension Popup Logic

let capturedData = null;

// DOM Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const capturedBox = document.getElementById('captured-box');
const capturedTitle = document.getElementById('captured-title');
const capturedTime = document.getElementById('captured-time');
const capturedCount = document.getElementById('captured-count');
const btnSend = document.getElementById('btn-send');
const btnOpenApp = document.getElementById('btn-open-app');

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  loadCapturedData();
  setupEventListeners();
});

function loadCapturedData() {
  chrome.storage.local.get(['lastNetflixCaptions'], (result) => {
    if (result.lastNetflixCaptions) {
      capturedData = result.lastNetflixCaptions;
      
      // Update UI
      statusDot.className = 'dot green';
      statusText.textContent = '자막 준비 완료! 전송 가능';
      
      capturedTitle.textContent = capturedData.title || '제목 없음';
      
      const date = new Date(capturedData.capturedAt);
      capturedTime.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      capturedCount.textContent = capturedData.cues ? capturedData.cues.length : 0;
      
      capturedBox.classList.remove('hidden');
      btnSend.disabled = false;
    } else {
      statusDot.className = 'dot gray';
      statusText.textContent = '자막 수집 대기 중...';
      capturedBox.classList.add('hidden');
      btnSend.disabled = true;
    }
  });
}

function setupEventListeners() {
  // Listen for real-time capture updates while popup is open
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SUBTITLES_CAPTURED') {
      loadCapturedData();
    }
  });

  // Open web app
  btnOpenApp.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://myscriptdocs.vercel.app/' });
  });

  // Send subtitles to web app
  btnSend.addEventListener('click', () => {
    if (!capturedData) return;

    // Search for existing MyScriptDocs web app tabs
    chrome.tabs.query({}, (tabs) => {
      // Find tabs matching Vercel URL or local network IP addresses
      const webAppTabs = tabs.filter(tab => {
        const url = tab.url || '';
        return url.startsWith('https://myscriptdocs.vercel.app/') ||
               url.startsWith('http://localhost:3000') ||
               url.startsWith('http://127.0.0.1:3000') ||
               /https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):3000/.test(url);
      });

      if (webAppTabs.length > 0) {
        // Target open tab
        const targetTab = webAppTabs[0];
        chrome.tabs.sendMessage(targetTab.id, {
          type: 'LOAD_SUBTITLES',
          data: capturedData
        }, (response) => {
          // Focus the tab and close popup
          chrome.tabs.update(targetTab.id, { active: true });
          window.close();
        });
      } else {
        // Open web app in new tab. Relaying is handled by webapp_relay.js auto-load.
        chrome.tabs.create({ url: 'https://myscriptdocs.vercel.app/' }, () => {
          alert("학습 웹앱이 열려있지 않아 새 탭으로 실행합니다. 잠시 후 자막이 자동으로 전송됩니다.");
          window.close();
        });
      }
    });
  });
}
