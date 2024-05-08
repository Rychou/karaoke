export function getBlackVideoTrackFromCanvas() {
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

export async function getUserSig(userId, roomId) {
  const result = await fetch(
    "https://service.trtc.qcloud.com/release/UserSigService",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: JSON.stringify({
        pwd: "12345678",
        appid: getSDKAppId(),
        roomnum: parseInt(roomId),
        privMap: 255,
        identifier: userId,
        accounttype: 14418,
      }),
    }
  );
  return result.json();
}

export function getSDKAppId() {
  return +new URLSearchParams(location.search).get('sdkAppId') || 1400188366;
}