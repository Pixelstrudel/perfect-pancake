class PancakeTimer {
  constructor() {
    this.startTime = null;
    this.elapsed = 0;
    this.timerInterval = null;
    this.isRunning = false;
    this.onTick = null;
  }

  start(onTickCallback) {
    if (this.isRunning) return;
    
    this.onTick = onTickCallback;
    this.startTime = Date.now() - this.elapsed;
    this.isRunning = true;
    
    this.timerInterval = setInterval(() => {
      this.elapsed = Date.now() - this.startTime;
      if (this.onTick) {
        this.onTick(this.elapsed);
      }
    }, 100); // Update every 100ms for smoother visual updates
  }

  pause() {
    if (!this.isRunning) return;
    
    clearInterval(this.timerInterval);
    this.isRunning = false;
  }

  reset() {
    this.pause();
    this.elapsed = 0;
    if (this.onTick) {
      this.onTick(this.elapsed);
    }
  }

  getElapsed() {
    return this.elapsed;
  }

  getElapsedInSeconds() {
    return Math.floor(this.elapsed / 1000);
  }

  formatElapsedTime() {
    const totalSeconds = this.getElapsedInSeconds();
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

export default new PancakeTimer();