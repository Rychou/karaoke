<script>
import { getSDKAppId } from '@/utils';


export default {
  data() {
    return {
      roomId: "561651",
      role: 'anchor-main',
    };
  },
  mounted() {
    this.role = this.$route.query.role || this.role
    this.roomId = +(this.$route.query.roomId || this.roomId)
  },

  methods: {
    async enterRoom() {
      this.$store.commit("update", {
        sdkAppId: getSDKAppId(),
        roomId: this.roomId,
        scene: "live",
        role: this.role
      });
      this.$router.push({
        name: 'ktv',
        query: { ...this.$route.query, role: this.role },
      });
    },
  },
};
</script>

<template>
  <main>
    <input v-model="roomId" />
    <div>
      <input
        type="radio"
        id="anchor-main"
        name="role"
        value="anchor-main"
        checked
        v-model="role"
      />
      <label for="anchor-main">主播</label>
    </div>
    <div>
      <input
        type="radio"
        id="anchor-sub"
        name="role"
        value="anchor-sub"
        v-model="role"
      />
      <label for="anchor-sub">合唱</label>
    </div>
    <div>
      <input
        type="radio"
        id="audience"
        name="role"
        value="audience"
        v-model="role"
      />
      <label for="audience">观众</label>
    </div>
    <button @click="enterRoom">进房</button>
  </main>
</template>
