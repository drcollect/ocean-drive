#!/usr/bin/env bash
# Cut a video from what src/dev/trailer.ts recorded into .trailer/: each shot's frames (.trailer/<shot>/NNNN.jpg)
# and its sound (.trailer/audio/<shot>.wav, the game's own mix), with the café's bossa nova (audio/music.wav)
# as the bed.
#   scripts/trailer.sh          the 15 s trailer: .trailer/ocean-drive-trailer.mp4 (1080p30, to post),
#                               public/trailer.mp4 (the site's lighter copy) and ../renders/trailer.gif (README)
#   scripts/trailer.sh social   the drop video for the thread: ../renders/social/ocean-drive-drop.mp4
# FFMPEG=/path/to/ffmpeg if it isn't on the PATH.
set -euo pipefail
cd "$(dirname "$0")/.."
FF=${FFMPEG:-ffmpeg}
T=.trailer
CUT=${1:-trailer}
case "$CUT" in
  trailer)
    SHOTS=(street beach drive crash drop end)
    GAINS=(6 1 0 0 1 4) # dB: the quiet ambiences up, the car as it is
    OUT="$T/ocean-drive-trailer.mp4"
    ;;
  social)
    SHOTS=(s-street s-walk s-pay s-board s-reveal s-getin s-drive s-crash s-end)
    GAINS=(6 6 6 4 0 6 0 0 4)
    OUT=../renders/social/ocean-drive-drop.mp4
    ;;
  *)
    echo "unknown cut: $CUT (trailer or social)" >&2
    exit 1
    ;;
esac
mkdir -p "$(dirname "$OUT")"

# the picture: every shot's frames in order
rm -rf "$T/all" && mkdir -p "$T/all"
n=0
for s in "${SHOTS[@]}"; do
  for f in "$T/$s"/*.jpg; do
    n=$((n + 1))
    ln -s "../$s/$(basename "$f")" "$T/all/$(printf %04d $n).jpg"
  done
done
secs=$(python3 -c "print($n / 30)")
echo "$CUT: $n frames, $secs s"

# the sound: the shots' mixes cut together (a few ms of fade at each cut), the music under them, then
# loudness to -14 LUFS in two passes
filter=""
inputs=()
labels=""
i=0
for s in "${SHOTS[@]}"; do
  d=$(python3 -c "import os; print((os.path.getsize('$T/audio/$s.wav') - 44) / 8 / 48000)")
  inputs+=(-i "$T/audio/$s.wav")
  filter+="[$i:a]volume=${GAINS[$i]}dB,afade=t=in:d=0.012,afade=t=out:st=$(python3 -c "print($d - 0.012)"):d=0.012[a$i];"
  labels+="[a$i]"
  i=$((i + 1))
done
inputs+=(-i "$T/audio/music.wav")
filter+="${labels}concat=n=$i:v=0:a=1[sfx];"
filter+="[$i:a]atrim=start=0.25:duration=$secs,asetpts=PTS-STARTPTS,volume=-3dB,afade=t=in:d=0.4,afade=t=out:st=$(python3 -c "print($secs - 0.9)"):d=0.9[mus];"
filter+="[sfx][mus]amix=inputs=2:normalize=0:duration=first[mix]"
"$FF" -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "$filter" -map "[mix]" -c:a pcm_f32le "$T/mix.wav"
m=$("$FF" -hide_banner -i "$T/mix.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | python3 -c "
import sys, json
t = sys.stdin.read(); j = json.loads(t[t.rindex('{'):t.rindex('}') + 1])
print(f\"measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}\")")
"$FF" -hide_banner -loglevel error -y -i "$T/mix.wav" -af "loudnorm=I=-14:TP=-1.5:LRA=11:$m:linear=true,aresample=48000" -c:a pcm_s16le "$T/sound.wav"

# to post: 1080p30, H.264 High, AAC (X, Telegram, anywhere), under 30 MB
# (the frames are full-range BT.601 JPEGs: video wants limited-range BT.709)
"$FF" -hide_banner -loglevel error -y -framerate 30 -i "$T/all/%04d.jpg" -i "$T/sound.wav" \
  -vf "scale=in_range=full:out_range=limited:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p" \
  -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:v libx264 -preset slow -crf 19 -maxrate 11M -bufsize 22M -profile:v high \
  -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
if [ "$CUT" = trailer ]; then
  # the site's copy: lighter
  "$FF" -hide_banner -loglevel error -y -i "$OUT" \
    -c:v libx264 -preset slow -crf 25 -maxrate 5M -bufsize 10M -profile:v high -pix_fmt yuv420p \
    -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
    -c:a aac -b:a 128k -movflags +faststart public/trailer.mp4
  # the README's preview: a small GIF (no sound), its own palette
  "$FF" -hide_banner -loglevel error -y -i "$OUT" \
    -vf "fps=8,scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
    ../renders/trailer.gif
  ls -la public/trailer.mp4 ../renders/trailer.gif
fi
ls -la "$OUT"
