const express = require('express');
const cors = require('cors');
const path = require('path');
const { getSubtitles, getVideoDetails } = require('youtube-caption-extractor');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to fetch YouTube subtitles using youtube-caption-extractor
app.get('/api/youtube-transcript', async (req, res) => {
  const videoUrl = req.query.url;
  if (!videoUrl) {
    return res.status(400).json({ error: 'Video URL is required' });
  }

  // Extract video ID
  let videoId = '';
  try {
    const urlObj = new URL(videoUrl);
    if (urlObj.hostname.includes('youtube.com')) {
      videoId = urlObj.searchParams.get('v');
    } else if (urlObj.hostname.includes('youtu.be')) {
      videoId = urlObj.pathname.substring(1);
    } else {
      videoId = videoUrl;
    }
  } catch (e) {
    videoId = videoUrl;
  }

  if (!videoId || videoId.length !== 11) {
    return res.status(400).json({ error: 'Invalid YouTube URL or Video ID' });
  }

  try {
    console.log(`Fetching details & subtitles for video: ${videoId}`);
    // Fetch video details and subtitles
    const details = await getVideoDetails({ videoID: videoId, lang: 'en' });
    
    // Check if subtitles were retrieved
    if (!details.subtitles || details.subtitles.length === 0) {
      return res.status(404).json({ 
        error: 'No English subtitles found for this video on the server. You can try playing the video on PC with the MyScriptDocs extension, or copy-paste the transcript manually.',
        title: details.title,
        description: details.description
      });
    }

    res.json({
      videoId,
      title: details.title,
      description: details.description,
      transcript: details.subtitles.map(s => ({
        start: parseFloat(s.start),
        duration: parseFloat(s.dur),
        text: s.text
      }))
    });

  } catch (error) {
    console.error('Error fetching YouTube subtitles:', error.message);
    res.status(500).json({ 
      error: `Server failed to extract transcript: ${error.message}. This video may be restricted by YouTube. Please use the extension on PC or paste the transcript manually.` 
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MyScriptDocs local server running at http://localhost:${PORT}`);
  console.log(`Access on iPad using: http://<YOUR_PC_IP_ADDRESS>:${PORT}`);
});

// Vercel Serverless Function을 위한 내보내기
module.exports = app;
