/* Audio stays in memory. The AudioContext supplies mono 24 kHz samples. */
class DexterVoiceAudio extends AudioWorkletProcessor {
  constructor() {
    super()
    this.inputBuffer = new Int16Array(1200)
    this.inputOffset = 0
    this.outputQueue = []
    this.outputOffset = 0
    this.queuedSamples = 0
    this.muted = false
    this.frames = 0
    this.port.onmessage = ({ data }) => {
      if (data.type === 'audio') {
        // Bound latency and memory on a stalled output device.
        const samples = new Int16Array(data.buffer)
        if (this.queuedSamples + samples.length > 48000) {
          this.outputQueue = []; this.outputOffset = 0; this.queuedSamples = 0
          this.port.postMessage({ type: 'playback_overflow' })
          return
        }
        this.outputQueue.push(samples); this.queuedSamples += samples.length
      }
      if (data.type === 'mute') this.muted = data.muted
      if (data.type === 'clear') { this.outputQueue = []; this.outputOffset = 0; this.queuedSamples = 0 }
    }
  }
  process(inputs, outputs) {
    const input = inputs[0]?.[0]
    const output = outputs[0][0]
    let inputEnergy = 0, outputEnergy = 0
    for (let i = 0; i < output.length; i++) {
      const sample = this.muted ? 0 : (input?.[i] || 0)
      inputEnergy += sample * sample
      this.inputBuffer[this.inputOffset++] = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
      if (this.inputOffset === this.inputBuffer.length) {
        this.port.postMessage({ type: 'input', buffer: this.inputBuffer.buffer }, [this.inputBuffer.buffer])
        this.inputBuffer = new Int16Array(1200)
        this.inputOffset = 0
      }
      const head = this.outputQueue[0]
      output[i] = head ? head[this.outputOffset++] / 32768 : 0
      if (head) this.queuedSamples--
      outputEnergy += output[i] * output[i]
      if (head && this.outputOffset >= head.length) { this.outputQueue.shift(); this.outputOffset = 0 }
    }
    if (++this.frames % 10 === 0) this.port.postMessage({ type: 'level', input: Math.sqrt(inputEnergy / output.length), output: Math.sqrt(outputEnergy / output.length) })
    return true
  }
}
registerProcessor('dexter-voice-audio', DexterVoiceAudio)
