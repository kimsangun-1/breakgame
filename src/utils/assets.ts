export class SoundManager {
  private audio: HTMLAudioElement | null = null;
  private isLoaded: boolean = false;
  private hasError: boolean = false;

  constructor(src: string = "/Hyper_Speed_Run.mp3") {
    if (typeof window !== "undefined") {
      this.init(src);
    }
  }

  private init(src: string) {
    try {
      this.audio = new Audio(src);
      this.audio.loop = true;

      this.audio.addEventListener("canplaythrough", () => {
        this.isLoaded = true;
      });

      this.audio.addEventListener("error", (e) => {
        console.warn(`[SoundManager] Audio file failed to load: ${src}`, e);
        this.hasError = true;
        this.audio = null;
      });
    } catch (err) {
      console.warn("[SoundManager] HTMLAudioElement initialization failed:", err);
      this.hasError = true;
      this.audio = null;
    }
  }

  public play() {
    if (!this.audio || this.hasError) return;
    this.audio.play().catch((err) => {
      // Typically blocked by autoplay policy until user interaction
      console.info("[SoundManager] Autoplay blocked or failed, waiting for user gesture:", err.message);
    });
  }

  public pause() {
    if (!this.audio) return;
    this.audio.pause();
  }

  public toggle(isPlaying: boolean): boolean {
    if (isPlaying) {
      this.pause();
      return false;
    } else {
      this.play();
      return true;
    }
  }

  public setVolume(volume: number) {
    if (this.audio) {
      this.audio.volume = Math.max(0, Math.min(1, volume));
    }
  }
}

/**
 * Loads an image safely. If it fails or is absent, returns null instead of throwing an error.
 */
export function loadGameImage(src: string = "/Mascot.jpg"): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }

    const img = new window.Image();
    img.src = src;
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      console.warn(`[GameAsset] Image failed to load: ${src}. Fallback rendering will be used.`, e);
      resolve(null);
    };
  });
}
