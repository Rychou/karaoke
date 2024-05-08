<template>
  <div>
    <lyric-player :currentTime="currentTime" />
    <audio-player
      v-if="!isAudience"
      @audio-track="onAudioTrack"
      @toggle-music="onToggleMusic"
      @timeupdate="onTimeupdate"
      @ended="onEnded"
      ref="audioPlayer"
    />
    <button
      @click="startChorus"
      v-if="isAnchorMain && !isChorusStarted && isNtpTimeUpdated"
    >
      开始合唱(3s)
    </button>

    <div v-if="!isAudience">
      <div>人声进度：{{ vocalCurrentTime }}</div>
      <button v-if="isAbleToStartLocalAudio" @click="startLocalAudio">
        上麦
      </button>
      <button v-else @click="stopLocalAudio">下麦</button>
      <button :disabled="!isAbleToStartLocalAudio" @click="startBGMVocal()">
        开 BGM 人声2（原调）
      </button>
    </div>
    <div class="network">rtt: {{ rtt }} loss: {{ loss }}%</div>
    <div>
      <select v-model="selectedRemoteUserId">
        <option v-for="userId in remoteAudioUserIdList" :key="userId">
          {{ userId }}
        </option>
      </select>
    </div>
    <div>
      <label for="volume">调节远端人声音量</label>
      <input
        type="range"
        id="volume"
        name="volume"
        :min="0"
        :max="100"
        v-model="remoteVolume"
        @change="setRemoteVolume"
      />
    </div>
    <div>userId: {{ userId }}, roomId: {{ roomId }}</div>

    <div v-if="isAudience">
      <button @click="muteRemoteAudio(false)">听混音</button>
      <button @click="muteRemoteAudio(true)">听原始 rtc 流</button>
    </div>
    <button @click="exitRoom">退房</button>
    <button v-if="ntpTimestamp === 0" @click="showNTPTimestamp">
      展示 ntp 时间
    </button>
    <div v-if="ntpTimestamp > 0">{{ ntpTimestamp }}</div>
  </div>
</template>
<!-- eslint-disable vue/multi-word-component-names -->
<script>
import TRTC from "trtc-sdk-v5";
import { CDNStreaming, PublishMode } from "trtc-sdk-v5/plugins/cdn-streaming";
import { markRaw } from "vue";
import { getBlackVideoTrackFromCanvas, getSDKAppId, getUserSig } from "@/utils";
import AudioPlayer from "../components/AudioPlayer.vue";
import LyricPlayer from "../components/LyricPlayer.vue";
import VocalURL1 from "../assets/music4-vocal1.mp3";

const SEI_CMD = {
  START_CHORUS: "start_chorus",
  BGM_PROGRESS: "bgm_progress",
};

export default {
  components: { AudioPlayer, LyricPlayer },
  data() {
    return {
      userId: "",
      bgmUserId: "",
      roomId: 0,
      role: "",
      trtc: null,
      trtcBGM: null,
      currentTime: 0,
      chorus: {
        startPlayMusicTS: 0,
        START_CHORUS_INTERVAL_ID: 0,
        BGM_PROGRESS_INTERVAL_ID: 0,
      },
      isNtpTimeUpdated: false,
      ntpTimestamp: 0,
      remoteVolume: 100,

      isMicrophoneStarted: false,
      vocalAudio: null,
      vocalCurrentTime: 0,
      VOCAL_INTERVAL_ID: 0,

      rtt: 0,
      loss: 0,

      selectedRemoteUserId: "*",
      remoteAudioUserIdList: ["*"],
    };
  },
  computed: {
    isChorusStarted() {
      return this.chorus.startPlayMusicTS > 0;
    },
    isAbleToStartLocalAudio() {
      return this.vocalCurrentTime === 0 && !this.isMicrophoneStarted;
    },
    isAudience() {
      return this.role === "audience";
    },
    isAnchorMain() {
      return this.role === "anchor-main";
    },
    isAnchorSub() {
      return this.role === "anchor-sub";
    },
  },
  async mounted() {
    window.ktvView = this;
    this.trtc = markRaw(
      // eslint-disable-next-line no-undef
      TRTC.create({ enableChorus: true, plugins: [CDNStreaming] })
    );
    this.trtcBGM = markRaw(
      TRTC.create({ enableSEI: true, enableChorus: true })
    );
    this.role = this.$route.query.role || this.$store.state.role;
    this.roomId = +this.$route.query.roomId || this.$store.state.roomId;
    this.userId = this.$store.state.userId;
    this.bgmUserId = this.$store.state.userId + "_bgm";

    if (this.isAnchorMain) {
      this.trtcBGM.startLocalVideo({
        option: {
          videoTrack: getBlackVideoTrackFromCanvas(),
          profile: { bitrate: 50 },
        },
      });
    }
    this.handleEvents();
    await this.enterRoom();
  },
  methods: {
    startChorus() {
      const data = {
        cmd: SEI_CMD.START_CHORUS,
        start_play_music_ts: this.trtc.getNetworkTime() + 3000,
        music_id: "25710",
        is_origin_music: "true",
      };
      setTimeout(() => this.$refs.audioPlayer.play(), 3000);

      // 主唱发起混流回推到 trtc 房间，观众端订阅 robot 的流
      this.trtc.startPlugin("CDNStreaming", {
        target: {
          publishMode: PublishMode.PublishMixStreamToRoom,
          robotUser: {
            userId: `${this.userId}_robot`, // 建议动态生成
            roomId: +this.roomId,
          },
        },
        encoding: {
          audioBitrate: 128,
          audioChannels: 2,
        },
        mix: {
          videoLayoutList: [
            {
              fixedVideoUser: {
                userId: `${this.userId}_bgm`,
                roomId: +this.roomId,
              },
              width: 64,
              height: 64,
              locationX: 0,
              locationY: 0,
              fixedVideoStreamType: TRTC.TYPE.STREAM_TYPE_MAIN,
              zOrder: 1,
            },
          ],
        },
      });

      this.chorus.startPlayMusicTS = data.start_play_music_ts;

      this.chorus.START_CHORUS_INTERVAL_ID = setInterval(
        () =>
          this.trtcBGM.sendSEIMessage(
            new TextEncoder().encode(JSON.stringify(data)).buffer
          ),
        1000
      );
      if (this.isAnchorMain) {
        this.chorus.BGM_PROGRESS_INTERVAL_ID = setInterval(() => {
          this.fixBGMProgress();
          this.fixVocalProgress();
          const data = {
            cmd: SEI_CMD.BGM_PROGRESS,
            music_id: "25710",
            current_time: this.$refs.audioPlayer.audio.currentTime * 1000,
            total_time: this.$refs.audioPlayer.audio.duration * 1000,
          };
          this.trtcBGM.sendSEIMessage(
            new TextEncoder().encode(JSON.stringify(data)).buffer
          );
        }, 200);
      }
    },
    stopChorus() {
      clearInterval(this.chorus.START_CHORUS_INTERVAL_ID);
      clearInterval(this.chorus.BGM_PROGRESS_INTERVAL_ID);
      this.chorus.startPlayMusicTS = 0;
      if (this.isAnchorMain) {
        this.trtc.stopPlugin("CDNStreaming", {
          target: {
            publishMode: PublishMode.PublishMixStreamToCDN,
          },
        });
      }
    },

    // 合唱者收到开始合唱信令，则在指定时间开始合唱
    onReceiveStartChorus(data) {
      if (this.isChorusStarted || !this.isAnchorSub) return;
      this.chorus.startPlayMusicTS = data.start_play_music_ts;
      const delay = data.start_play_music_ts - this.trtc.getNetworkTime();
      // 合唱未开始，在 delay ms 内，开始播放 bgm
      if (delay > 0) {
        console.time(`startChorus setTimeout ${delay}`);
        setTimeout(() => {
          this.$refs.audioPlayer.play();
          console.timeEnd(`startChorus setTimeout ${delay}`);
        }, delay);
      } else {
        // 合唱开始，开始播放 bgm，并修正进度
        this.$refs.audioPlayer.play();
        this.fixBGMProgress();
      }
    },

    onReceiveBGMProgress(data) {
      this.fixBGMProgress();
      this.fixVocalProgress();
      if (this.isAudience) {
        // 观众收到歌曲进度信令，则更新歌词进度
        this.currentTime = data.current_time / 1000;
      }
    },
    onAudioTrack({ audioTrack }) {
      if (!this.isAnchorMain) return;
      // 主唱推 bgm
      this.trtcBGM.startLocalAudio({
        option: {
          audioTrack,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          profile: "high",
        },
      });
    },
    onToggleMusic({ audioTrack }) {
      this.trtcBGM.updateLocalAudio({
        option: { audioTrack },
      });
    },
    onTimeupdate(currentTime) {
      this.currentTime = currentTime;
    },
    onEnded() {
      this.stopChorus();
      this.stopLocalAudio();
    },
    setRemoteVolume() {
      this.trtc.setRemoteAudioVolume(
        this.selectedRemoteUserId,
        +this.remoteVolume
      );
    },
    handleEvents() {
      this.trtc.on(TRTC.EVENT.NETWORK_TIME_UPDATED, () => {
        this.isNtpTimeUpdated = true;
      });
      this.trtc.on(TRTC.EVENT.NETWORK_QUALITY, (event) => {
        this.rtt = event.uplinkRTT;
        this.loss = event.uplinkLoss;
      });
      this.trtc.on(TRTC.EVENT.REMOTE_AUDIO_AVAILABLE, (event) => {
        this.remoteAudioUserIdList.push(event.userId);
        // 观众只拉 robot
        if (this.isAudience && event.userId.includes("robot")) {
          this.trtc.muteRemoteAudio(event.userId, false);
        }
        // 合唱和主唱，只拉人声，不拉 bgm 不拉 robot
        if (
          !this.isAudience &&
          !event.userId.includes("bgm") &&
          !event.userId.includes("robot")
        ) {
          this.trtc.muteRemoteAudio(event.userId, false);
        }
      });
      this.trtc.on(TRTC.EVENT.REMOTE_AUDIO_UNAVAILABLE, (event) => {
        this.remoteAudioUserIdList = this.remoteAudioUserIdList.filter(
          (userId) => userId !== event.userId
        );
      });
      this.trtc.on(TRTC.EVENT.REMOTE_VIDEO_AVAILABLE, (event) => {
        // 观众只拉 robot 的视频，解析 SEI
        if (this.isAudience && event.userId.includes("robot")) {
          this.trtc.startRemoteVideo({
            userId: event.userId,
            streamType: event.streamType,
          });
        }
        // 合唱只拉主唱 bgm 的视频，解析 SEI
        if (this.isAnchorSub && event.userId.includes("bgm")) {
          this.trtc.startRemoteVideo({
            userId: event.userId,
            streamType: event.streamType,
          });
        }
      });
      this.trtc.on(TRTC.EVENT.KICKED_OUT, () => {
        this.exitRoom();
      });
      // 合唱者才需监听 sei message，主场和观众不需要
      this.trtc.on(TRTC.EVENT.SEI_MESSAGE, (event) => {
        const data = JSON.parse(new TextDecoder().decode(event.data));
        console.warn(data);
        if (data.cmd === SEI_CMD.START_CHORUS) {
          this.onReceiveStartChorus(data);
        } else if (data.cmd === SEI_CMD.BGM_PROGRESS || data.current_time) {
          this.onReceiveBGMProgress(data);
        }
      });
    },

    async enterRoom() {
      const result = await getUserSig(this.userId, this.roomId);
      await this.trtc.enterRoom({
        sdkAppId: getSDKAppId(),
        roomId: this.roomId,
        userId: this.userId,
        userSig: result.data.userSig,
        scene: "live",
        role: this.isAudience ? "audience" : "anchor",
        autoReceiveAudio: false,
        autoReceiveVideo: false,
      });
      if (this.isAnchorMain) {
        const {
          data: { userSig },
        } = await getUserSig(this.bgmUserId, this.roomId);
        await this.trtcBGM.enterRoom({
          sdkAppId: getSDKAppId(),
          roomId: this.roomId,
          userId: this.bgmUserId,
          userSig,
          scene: "live",
          role: this.isAudience ? "audience" : "anchor",
          autoReceiveAudio: false, // bgm 用户纯推流，不拉流
          autoReceiveVideo: false, // bgm 用户纯推流，不拉流
        });
      }
    },
    async exitRoom() {
      this.stopChorus();
      this.stopLocalAudio();
      this.stopBGMVocal();
      await this.trtc.exitRoom();
      if (!this.isAudience) {
        this.$refs.audioPlayer.stop();
      }
      clearInterval(this.chorus.START_CHORUS_INTERVAL_ID);
      clearInterval(this.chorus.BGM_PROGRESS_INTERVAL_ID);
      this.$router.replace({
        name: "home",
        query: this.$route.query,
      });
      await this.trtcBGM.exitRoom();
      await this.trtcBGM.stopLocalAudio();
      this.trtcBGM.destroy();
      this.trtc.destroy();
    },
    async startLocalAudio() {
      await this.trtc.startLocalAudio({
        option: {
          microphoneId: "default",
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          profile: "high",
        },
      });
      this.isMicrophoneStarted = true;
    },
    async stopLocalAudio() {
      await this.trtc.stopLocalAudio();
      this.stopBGMVocal();
      this.isMicrophoneStarted = false;
    },
    // 推人声，用于模拟唱歌
    async startBGMVocal() {
      this.vocalAudio = new Audio(VocalURL1);
      console.time("startBGMVocal");
      await this.vocalAudio.play();
      console.timeEnd("startBGMVocal");

      this.VOCAL_INTERVAL_ID = setInterval(() => {
        if (!this.vocalAudio) {
          clearInterval(this.VOCAL_INTERVAL_ID);
          return;
        }
        this.vocalCurrentTime = this.vocalAudio.currentTime;
      }, 50);
      this.fixVocalProgress();
      this.trtc.startLocalAudio({
        option: {
          audioTrack: this.vocalAudio.captureStream().getTracks()[0],
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          profile: "high",
        },
      });
    },
    async stopBGMVocal() {
      if (this.vocalAudio) {
        this.vocalAudio.src = "";
        this.vocalAudio.currentTime = 0;
        this.vocalAudio.load();
        this.vocalAudio = null;
        this.vocalCurrentTime = 0;
        clearInterval(this.VOCAL_INTERVAL_ID);
        this.isMicrophoneStarted = false;
      }
    },
    fixVocalProgress() {
      if (!this.vocalAudio) return;
      const currentTime = this.vocalAudio.currentTime * 1000;
      const estimatedTime =
        this.trtc.getNetworkTime() - this.chorus.startPlayMusicTS;
      const offset = Math.abs(currentTime - estimatedTime);
      if (estimatedTime >= 0 && offset > 100) {
        console.warn(
          `fixVocalProgress offset: ${offset}ms ${currentTime} ${estimatedTime}`
        );
        this.vocalAudio.currentTime = estimatedTime / 1000;
      }
    },
    fixBGMProgress() {
      if (!this.$refs.audioPlayer) return;
      const currentTime = this.$refs.audioPlayer.audio.currentTime * 1000;
      const estimatedTime =
        this.trtc.getNetworkTime() - this.chorus.startPlayMusicTS;
      const offset = Math.abs(currentTime - estimatedTime);
      if (estimatedTime >= 0 && offset > 50) {
        console.warn(
          `fixSongProgress offset: ${offset}ms ${currentTime} ${estimatedTime}`
        );
        this.$refs.audioPlayer.seek(estimatedTime / 1000);
      }
    },
    showNTPTimestamp() {
      setInterval(() => {
        this.ntpTimestamp = this.trtc.getNetworkTime();
      }, 1);
    },

    muteRemoteAudio(muteRobot) {
      this.remoteAudioUserIdList.forEach((userId) => {
        if (userId === "*") return;
        if (muteRobot) {
          this.trtc.muteRemoteAudio(userId, userId.includes("robot"));
        } else {
          this.trtc.muteRemoteAudio(userId, !userId.includes("robot"));
        }
      });
    },
  },
};
</script>

<style>
.mic-list {
  display: flex;
  justify-content: space-between;
}
</style>
