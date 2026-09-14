import { spawnSync } from 'node:child_process';
import { mkdirSync, renameSync } from 'node:fs';

// An eight-second cinemagraph. Only the river is displaced; the skyline stays still.
const duration = 8;
const fps = 24;
const water = 'min(max((Y/H-0.665)*8,0),1)*min(max((X/W-0.18)*10,0),1)';
// Feather around the ferry so stronger waves do not create a rectangular seam.
const ferry = 'clip((pow((X/W-0.90)/0.09,2)+pow((Y/H-0.733)/0.045,2)-0.5)/1.5,0,1)';
const strength = `(${water})*${ferry}`;
const dx = `(${strength})*(16*sin(Y*4/14+2*PI*T/2)+6*sin(Y*4/35-2*PI*T/4))`;
const dy = `(${strength})*5*sin(X*4/90+Y*4/24+2*PI*T/4)`;
// Evaluate small grayscale displacement maps, then upscale them for the full-resolution art.
const filter = `[0:v]format=gbrp[src];[1:v]format=gray,geq=lum='128+${dx}',scale=1536:1024:flags=bilinear,format=gbrp[x];[2:v]format=gray,geq=lum='128+${dy}',scale=1536:1024:flags=bilinear,format=gbrp[y];[src][x][y]displace=edge=smear,format=yuv420p[out]`;
const run = args => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-y', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
};
mkdirSync('public/media', { recursive: true });
run(['-loop','1','-framerate',String(fps),'-i','public/images/shanghai-radar-cover.jpg',
  '-f','lavfi','-i',`nullsrc=s=384x256:r=${fps}:d=${duration}`,'-f','lavfi','-i',`nullsrc=s=384x256:r=${fps}:d=${duration}`,'-t',String(duration),'-filter_complex',filter,'-map','[out]','-an','-c:v','libx264','-crf','21','-preset','medium',
  '-movflags','+faststart','public/media/shanghai-radar-loop.next.mp4']);
run(['-i','public/media/shanghai-radar-loop.next.mp4','-filter_complex',
  '[0:v]fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle',
  '-loop','0','public/media/shanghai-radar-loop.next.gif']);

renameSync('public/media/shanghai-radar-loop.next.mp4', 'public/media/shanghai-radar-loop.mp4');
renameSync('public/media/shanghai-radar-loop.next.gif', 'public/media/shanghai-radar-loop.gif');
