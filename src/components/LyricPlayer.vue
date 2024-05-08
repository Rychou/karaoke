<template>
  <div class="lyric-wrapper">
    <div class="current">{{ current.text }}</div>
    <div class="next" style="text-align: right">{{ next.text }}</div>
  </div>
</template>

<script>
import lyric from "../utils/lrc-music4.json";
export default {
  name: "lyric-wrapper",
  props: {
    currentTime: Number,
  },
  data() {
    return {
      lyric: [],
    };
  },
  mounted() {
    this.lyric = lyric;
  },
  computed: {
    currentLrcIndex() {
      return this.lyric.findIndex((item, index) => {
        // 当前进度，在正在唱的那段歌词 start end 中间
        if (this.currentTime >= item.start && this.currentTime <= item.end)
          return true;
        // 当前进度，在刚唱完那段歌词 end 之后，下一段歌词 end - 200ms 之前
        else if (
          this.lyric[index + 1] &&
          this.currentTime < this.lyric[index + 1].start - 0.2
        )
          return true;
        // 当前进度，在下一段 start - 200ms 之前
        else if (this.lyric[index].start > this.currentTime + 0.2) return true;
        return false;
      });
    },
    current() {
      return (
        this.lyric[this.currentLrcIndex] || { start: 0, end: 0, text: "..." }
      );
    },
    next() {
      return (
        this.lyric[this.currentLrcIndex + 1] || {
          start: 0,
          end: 0,
          text: "...",
        }
      );
    },
  },
};
</script>

<style scoped>
.current {
  font-weight: bold;
}
.next {
  color: gray;
}
</style>