/**
 * AudioWorkletProcessor that plays PCM samples from a ring buffer.
 * Incoming float samples are posted via the port; the processor
 * reads them out at a steady rate with no gaps.
 */
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Ring buffer — 10 seconds at 24kHz
    this.buffer = new Float32Array(24000 * 10);
    this.writePos = 0;
    this.readPos = 0;
    this.port.onmessage = (e) => {
      const samples = e.data;
      for (let i = 0; i < samples.length; i++) {
        this.buffer[this.writePos % this.buffer.length] = samples[i];
        this.writePos++;
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0][0];
    for (let i = 0; i < output.length; i++) {
      if (this.readPos < this.writePos) {
        output[i] = this.buffer[this.readPos % this.buffer.length];
        this.readPos++;
      } else {
        output[i] = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-playback-processor", PCMPlaybackProcessor);
