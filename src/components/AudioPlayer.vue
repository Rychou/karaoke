<template>
  <div class="player-wrapper">
    <div>
      <button @click="toggleMusic">
        {{ isOriginalSource ? "切伴奏" : "切原唱" }}
      </button>
      <div>
      <label for="volume">BGM 音量</label>
      <input
        type="range"
        id="volume"
        name="volume"
        :min="0"
        :max="100"
        v-model="volume"
        @change="setVolume"
      />
    </div>
      <div>原唱进度：{{ currentTime }}</div>
      <div>伴奏进度：{{ accCurrentTime }}</div>
    </div>
  </div>
</template>

<script>
// TODO: cut 后的歌词没对齐
import audioURL from "../assets/music4.mp3";
import audioACCURL from "../assets/music4-acc.mp3";
export default {
  name: "audio-player",
  data() {
    return {
      audioURL: audioURL,
      audioACCURL,
      audioTrack: null,
      isOriginalSource: true,
      currentTime: 0,
      accCurrentTime: 0,
      volume: 100,
      audio: new Audio(audioURL),
      audioACC: new Audio(audioACCURL),

      intervalId: 0
    };
  },
  computed: {},
  mounted() {
    this.audio.muted = false;
    this.audioACC.muted = true;
    this.audio.onplay = this.onPlay;
    this.audio.ontimeupdate = this.onTimeupdate;
    this.audio.onended = () => {
      this.$emit("ended");
    }
    this.intervalId = setInterval(() => {
      this.currentTime = this.audio.currentTime;
      this.accCurrentTime = this.audioACC.currentTime;
      this.$emit("timeupdate", this.currentTime);
    }, 50);
  },
  methods: {
    play() {
      console.time("audio-player.play");
      this.audio.play().then(() => {
        console.timeEnd("audio-player.play");
      });
      this.audioACC.play();
    },
    stop() {
      this.audio.src = "";
      this.audioACC.src = "";
      this.audio.pause();
      this.audioACC.pause();
      this.audio.load();
      this.audioACC.load();
      this.audio = null;
      this.audioACC = null;
      clearInterval(this.intervalId);
    },
    onPlay() {
      if (!this.audioTrack) {
        // 使用 audioContext 混合原唱 + 伴奏，通过控制 audio 标签的 muted 属性来决定使用原声还是伴奏
        const audioContext = new AudioContext();
        const audioSourceNode = audioContext.createMediaElementSource(
          this.audio
        );
        const accAudioSourceNode = audioContext.createMediaElementSource(
          this.audioACC
        );
        const destination = audioContext.createMediaStreamDestination();
        audioSourceNode.connect(destination);
        accAudioSourceNode.connect(destination);
        audioSourceNode.connect(audioContext.destination);
        accAudioSourceNode.connect(audioContext.destination);
        this.audioTrack = destination.stream.getAudioTracks()[0];
        this.$emit("audioTrack", { audioTrack: this.audioTrack });
      }
    },

    seek(targetTime) {
      console.warn("seek to ", targetTime);
      this.audio.currentTime = targetTime;
      this.audioACC.currentTime = targetTime;
    },

    toggleMusic() {
      this.isOriginalSource = !this.isOriginalSource;
      this.audio.muted = !this.isOriginalSource;
      this.audioACC.muted = this.isOriginalSource;
    },
    setVolume() {
      this.audio.volume = this.volume / 100;
      this.audioACC.volume = this.volume / 100;
    }, 
    onTimeupdate() {
      // console.debug(this.audio.currentTime);
      // this.currentTime = this.audio.currentTime;
      // this.$emit("timeupdate", this.currentTime);
    },
  },
};
</script>