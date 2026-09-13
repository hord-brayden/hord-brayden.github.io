/* Match recording.
 *
 * Captures the arena canvas together with the finished audio mix and hands
 * back a .webm file. This is the whole point of a simulation you only watch:
 * the interesting part is the clip, not the scoreboard.
 *
 * Video comes from `canvas.captureStream`, audio from a MediaStreamDestination
 * hung off the audio bus, and the two are muxed by MediaRecorder. If audio has
 * never been unlocked the recording is silent rather than broken.
 */

/** Codecs worth trying, best first. Safari supports none of these yet. */
const CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
];

export function recordingSupported() {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && !!HTMLCanvasElement.prototype.captureStream
    && CANDIDATES.some((t) => MediaRecorder.isTypeSupported(t));
}

export class Recorder {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} audio  the Audio instance, for its captureStream()
   */
  constructor(canvas, audio) {
    this.canvas = canvas;
    this.audio = audio;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.onStop = null;
  }

  get active() {
    return !!this.recorder && this.recorder.state === 'recording';
  }

  get elapsed() {
    return this.active ? (performance.now() - this.startedAt) / 1000 : 0;
  }

  start(fps = 60) {
    if (this.active || !recordingSupported()) return false;

    const video = this.canvas.captureStream(fps);
    const tracks = [...video.getVideoTracks()];
    const audio = this.audio && this.audio.captureStream();
    if (audio) tracks.push(...audio.getAudioTracks());

    const mimeType = CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
    try {
      this.recorder = new MediaRecorder(new MediaStream(tracks), {
        mimeType,
        videoBitsPerSecond: 10_000_000,
      });
    } catch (e) {
      this.recorder = null;
      return false;
    }

    this.chunks = [];
    this.mimeType = mimeType;
    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size) this.chunks.push(ev.data);
    };
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mimeType });
      this.chunks = [];
      this.recorder = null;
      if (this.onStop) this.onStop(blob);
    };
    // A timeslice keeps data flowing, so a long recording is not lost if the
    // tab is closed mid-match.
    this.recorder.start(1000);
    this.startedAt = performance.now();
    return true;
  }

  stop() {
    if (!this.active) return false;
    this.recorder.stop();
    return true;
  }

  /** Hand the finished clip to the browser as a download. */
  static save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 20_000);
  }
}
