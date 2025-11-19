try {
  const ff = require('ffmpeg-static');
  console.log(ff || '');
} catch (e) {
  process.exit(1);
}

