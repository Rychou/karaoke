## 功能描述

本文主要介绍如何在 Web 端实现实时合唱的功能，Android 和 iOS 端实现教程参考：[在线 K 歌](https://cloud.tencent.com/document/product/647/82176)。

在线体验 Demo: https://sdk-web-1252463788.cos.ap-hongkong.myqcloud.com/trtc/webrtc/v5/test/ntp/ktv/index.html#/ktv

## 前提说明

1. 本 Demo 是使用 Vite 构建的，Demo 使用本地 mp3 歌曲和歌词来模拟曲库的实现。歌曲名：“十年”。
    ```sh
    // 安装依赖
    npm install
    // 本地允许
    npm run dev
    // 打包构建 Demo
    npm run build
    ```
2. 本方案是无 UI 集成方案，SDK 提供实现实时合唱的核心功能，不提供 UI、曲库、房间管理、麦位控制等业务功能，您需要自行实现。
3. 实时合唱场景中，业务上有三种身份：主唱、合唱、观众，主唱发起合唱及向房间定时同步歌曲进度；合唱收到合唱信令后，上麦can而对于 TRTC 来说，主唱和合唱都是主播身份，可以上麦；观众不可以上麦。
4. Web 合唱实现流程和 Android 和 iOS 端基本一致，区别在于：
   - 官网的 Android 和 iOS Demo，开始合唱信令是通过自定义消息来发送的，同步歌曲进度信令是通过 SEI 消息发送的。
   -  Web 将在 v5.6.0 版本支持自定义消息收发（预计 2024-5-17 发布），目前版本(v5.5.2-ktv)暂不支持。因此目前是通过 SEI 来收发信令，包括：开始合唱信令、同步歌曲进度信令。
## 实现流程

1. 安装 sdk 包

    先装 ktv tag 这个版本，后续测试验收通过后，会发到正式版本。

    ```sh
    npm install trtc-sdk-v5@ktv
    ```

2. 主唱

- 创建两个 trtc 实例，以主播身份进房：一个推麦克风 + 拉合唱麦克风、一个推 BGM + 推 SEI。
  ```js
  import TRTC from 'trtc-sdk-v5';
  import { CDNStreaming, PublishMode } from 'trtc-sdk-v5/plugins/cdn-streaming';

  const trtc = TRTC.create({ enableChorus: true, plugins: [CDNStreaming] });
  const trtcBGM = TRTC.create({ enableSEI: true, enableChorus: true});

  trtc.on(TRTC.EVENT.REMOTE_AUDIO_AVAILABLE, event => {
    // 主唱只拉其他合唱的麦克风
    // bgm 是主唱推的背景音乐、robot 是服务端混流回推到 trtc 房间的流。
    if (!event.userId.includes('bgm') && !event.userId.includes('robot')) {
      trtc.muteRemoteAudio(event.userId, false);
    }
  })

  await trtc.enterRoom({
    sdkAppId,
    roomId,
    userId,
    userSig,
    scene: TRTC.TYPE.SCENE.LIVE,
    role: TRTC.TYPE.ROLE_ANCHOR,
    autoReceiveAudio: false,
    autoReceiveVideo: false,
  });
  await trtcBGM.enterRoom({
    sdkAppId,
    roomId,
    userId: `${userId}_bgm`,
    userSig,
    scene: TRTC.TYPE.SCENE.LIVE,
    role: TRTC.TYPE.ROLE_ANCHOR,
    autoReceiveAudio: false,
    autoReceiveVideo: false,
  });
  ```
- 同步 NTP 时间
  ```js
  // 进房前监听事件，在进房后，SDK 更新 ntp 时间成功后，会抛出此事件。
  trtc.on(TRTC.EVENT.NETWORK_TIME_UPDATED, event => {
    const timestamp = trtc.getNetworkTime();
  });
  ```
- 上麦打开麦克风
  ```js
  await trtc.startLocalAudio({
    option: {
      echoCancellation: false, // 关闭 3A，合唱场景需引导主播佩戴耳机
      noiseSuppression: false,
      autoGainControl: false,
      profile: "high", // high 是单声道高音质，high-stereo 是双声道高音质
    },
  })
  ```
- 点歌并获取到歌词信息
- 通过 SEI 发送开启合唱信令（合唱开始时间点 + 歌曲 ID）
  ```js
  function getBlackVideoTrackFromCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    setInterval(() => {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 64, 64);
    }, 66);
    return canvas.captureStream(15).getVideoTracks()[0];
  }
  // 推黑帧，用于发 SEI
  await trtcBGM.startLocalVideo({
    option: {
      videoTrack: getBlackVideoTrackFromCanvas(),
      profile: { bitrate: 50 },
    },
  });

  const data = {
    cmd: 'start_chorus',
    music_id: "",
    start_play_music_ts: trtc.getNetworkTime() + 3000, // 3s 后开始合唱
  }

  // 播放 BGM
  setTimeout(() => {}, 3000); 
  // 每隔 1s 发一次开始合唱信令，这样可以可以让合唱者，在合唱开始后，动态加入合唱
  setInterval(() => {
    trtcBGM.sendSEIMessage(new TextEncoder().encode(JSON.stringify(data)).buffer)
  }, 1000);
  ```
- 调用 TRTC API 发起混流回推 TRTC 房间任务。用于给观众拉流，观众只拉混流回推 trtc 房间的流。
  ```js
  trtc.startPlugin("CDNStreaming", {
    target: {
      publishMode: PublishMode.PublishMixStreamToRoom,
      robotUser: {
        userId: `${userId}_robot`,
        roomId,
      },
    },
    encoding: {
      audioBitrate: 128,
      audioChannels: 2
    },
    mix: {
      videoLayoutList: [
        {
          fixedVideoUser: {
            userId: `${userId}_bgm`,
            roomId,
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
  ```
- 合唱开始后，通过 SEI 定时(200ms)发送歌曲进度信息（当前歌曲播放进度时间、歌曲 ID 等）。
- 歌曲进度修正。由于 BGM 播放可能由于各种原因导致播放进度与预期不符，因此需要定时检查 BGM 播放进度，若与预期进度的偏差过大（例如 50ms），则手动调整 BGM 播放进度。
  ```js
  function fixBGMProgress() {
      const currentTime = 0; // 从业务侧曲库获取当前 BGM 播放进度
      const estimatedTime = trtc.getNetworkTime() - startPlayMusicTS; // 预期的 BGM 播放进度 = 当前时间 - 合唱开始时间
      const offset = Math.abs(currentTime - estimatedTime);
      if (estimatedTime >= 0 && offset > 50) {
        // BGM 播放进度与预期进度偏差超过 50ms，手动调整 BGM 播放进度
      }
    }
  ```
1. 合唱

- 创建一个 trtc 实例，以主播身份进房：推麦克风 + 接收 SEI + 拉合唱麦克风
  ```js
  const trtc = TRTC.create({ enableChorus: true });

  trtc.on(TRTC.EVENT.REMOTE_AUDIO_AVAILABLE, event => {
    // 只拉其他合唱的麦克风
    if (!event.userId.includes('bgm') && !event.userId.includes('robot')) {
      trtc.muteRemoteAudio(event.userId, false);
    }
  })

  await trtc.enterRoom({
    sdkAppId,
    roomId,
    userId,
    userSig,
    scene: TRTC.TYPE.SCENE.LIVE,
    role: TRTC.TYPE.ROLE_ANCHOR,
    autoReceiveAudio: false,
  });
  ```
- 同步  NTP 时间
- 上麦打开麦克风
- 接收 SEI 消息：
  - 收到合唱信令时，则在约定的时间点之前，根据歌曲 ID 预加载资源，在约定的时间点开始在本地播放歌曲，并且用本地播放歌曲的进度同步歌词进度。
  - 收到歌曲进度信息则忽略。
- 音频拉流时，只拉其他合唱的麦克风，不拉 BGM 及混流回推 robot 的音频流。
- 歌曲进度修正。由于 BGM 播放可能由于各种原因导致播放进度与预期不符，因此需要定时检查 BGM 播放进度，若与预期进度的偏差过大（例如 50ms），则手动调整 BGM 播放进度。

1. 观众

- 创建一个 trtc 实例，以观众身份进房：接收混流回推 robot 的音频流 及 SEI 消息
- 同步 NTP 时间
- 音频拉流只拉 robot，不拉其他合唱的麦克风及 BGM
- 接收 SEI 消息：
  - 收到合唱信令时，忽略，因为观众不能上麦合唱。
  - 收到歌曲进度信息，则根据歌曲进度信息，更新业务侧歌词进度。