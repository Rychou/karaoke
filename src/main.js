import './assets/main.css'

import { createApp } from 'vue'
import { createStore } from 'vuex'
import App from './App.vue'
import router from './router'
import { getSDKAppId } from './utils'

const app = createApp(App)
const store = createStore({
  state() {
    return {
      userId: 'u'+String(Math.floor(Math.random() * 100000)),
      roomId: 561651,
      userSig: '',
      role: 'anchor-main',
      sdkAppId: getSDKAppId()
    }
  },
  mutations: {
    update (state, payload) {
      Object.keys(payload).forEach(key => {
        state[key] = payload[key]
      })
    }
  }
})
app.use(store)
app.use(router)

app.mount('#app')
