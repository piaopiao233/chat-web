import { createApp } from 'vue'
import TDesign from 'tdesign-vue-next'
import TDesignChat from '@tdesign-vue-next/chat'

import 'tdesign-vue-next/es/style/index.css'
import '@tdesign-vue-next/chat/es/style/index.css'

import App from './App.vue'

const app = createApp(App)

app.use(TDesign)
app.use(TDesignChat)

app.mount('#app')
