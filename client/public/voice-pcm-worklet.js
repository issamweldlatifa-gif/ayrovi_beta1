/* AYROVI microphone PCM capture — same-origin AudioWorklet, no network access. */
class AyroviPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.sourceFramesPerChunk = Math.max(128, Math.round(sampleRate / 10));
    this.targetFramesPerChunk = Math.max(1, Math.round(this.sourceFramesPerChunk * this.targetRate / sampleRate));
    this.source = new Float32Array(this.sourceFramesPerChunk);
    this.offset = 0;
  }

  emitChunk() {
    const output = new Int16Array(this.targetFramesPerChunk);
    const ratio = this.sourceFramesPerChunk / this.targetFramesPerChunk;
    for (let index = 0; index < output.length; index += 1) {
      const start = Math.floor(index * ratio);
      const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
      let sum = 0;
      for (let sourceIndex = start; sourceIndex < end && sourceIndex < this.source.length; sourceIndex += 1) {
        sum += this.source[sourceIndex];
      }
      const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)));
      output[index] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    }
    this.port.postMessage(output.buffer, [output.buffer]);
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || !channel.length) return true;
    let sourceOffset = 0;
    while (sourceOffset < channel.length) {
      const count = Math.min(channel.length - sourceOffset, this.source.length - this.offset);
      this.source.set(channel.subarray(sourceOffset, sourceOffset + count), this.offset);
      this.offset += count;
      sourceOffset += count;
      if (this.offset === this.source.length) {
        this.emitChunk();
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('ayrovi-pcm-capture', AyroviPcmCaptureProcessor);
