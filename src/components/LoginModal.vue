<script setup>
import { computed, ref, watch } from 'vue'
import {
  NAvatar,
  NButton,
  NModal,
  NResult,
  NSpace,
  NSpin,
  NText,
  createDiscreteApi,
} from 'naive-ui'
import {
  fetchOneClickLoginSupport,
  fetchUserProfile,
} from '../api/auth'
import { setStoredProfile, setStoredSession } from '../utils/authStorage'

const props = defineProps({
  show: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:show', 'success'])

const PC_AID = '386088'

const { message } = createDiscreteApi(['message'])

const loginStep = ref('idle')
const loginHint = ref('')
const oneClickStep = ref('idle')
const oneClickHint = ref('')
const oneClickSessionId = ref('')
const oneClickProfile = ref(null)

const modalClosable = computed(() => loginStep.value !== 'profile-loading')

function getFirstImageUrl(imageLike) {
  if (!imageLike || !Array.isArray(imageLike.urls) || imageLike.urls.length === 0) {
    return ''
  }

  return imageLike.urls[0]
}

function normalizeUserProfile(payload) {
  const myInfo = payload?.my_info

  if (!myInfo?.id || !myInfo?.nickname) {
    throw new Error('个人信息返回结构不符合预期。')
  }

  return {
    id: myInfo.id,
    nickname: myInfo.nickname,
    douyinId: myInfo.douyin_id || '',
    avatar: getFirstImageUrl(myInfo.medium_avatar_url),
    isVip: Boolean(myInfo.is_vip),
    vipStage: myInfo.vip_stage || '',
  }
}

function resetLoginState() {
  loginStep.value = 'idle'
  loginHint.value = ''
  oneClickStep.value = 'idle'
  oneClickHint.value = ''
  oneClickSessionId.value = ''
  oneClickProfile.value = null
}

function closeModal() {
  if (!modalClosable.value) {
    return
  }

  emit('update:show', false)
  resetLoginState()
}

async function finishLogin(session) {
  const payload = await fetchUserProfile(session)
  const profile = normalizeUserProfile(payload)

  setStoredSession(session)
  setStoredProfile(profile)

  emit('success', {
    session,
    profile,
  })

  emit('update:show', false)
  resetLoginState()
}

async function detectOneClickLogin() {
  oneClickStep.value = 'loading'
  oneClickHint.value = '正在检测本地 SodaMusic 登录态...'
  oneClickSessionId.value = ''
  oneClickProfile.value = null

  try {
    const supportPayload = await fetchOneClickLoginSupport()

    if (!supportPayload?.supported) {
      oneClickStep.value = 'unsupported'
      oneClickHint.value = supportPayload?.message || '当前环境不支持一键登录。'
      return
    }

    const sessionid = String(supportPayload?.sessionid || '').trim()

    if (!sessionid) {
      oneClickStep.value = 'unsupported'
      oneClickHint.value = '检测到支持一键登录，但未读取到 sessionid。'
      return
    }

    oneClickSessionId.value = sessionid
    oneClickHint.value = '已检测到本地登录态，正在获取用户信息...'

    const session = {
      aid: PC_AID,
      sessionid,
    }

    const profilePayload = await fetchUserProfile(session)
    oneClickProfile.value = normalizeUserProfile(profilePayload)
    oneClickStep.value = 'ready'
    oneClickHint.value = '已检测到汽水音乐PC端已登录，可直接一键登录'
  } catch (error) {
    oneClickStep.value = 'unsupported'
    oneClickHint.value = error?.message || '检测一键登录支持失败。'
  }
}

async function submitOneClickLogin() {
  if (!oneClickSessionId.value) {
    message.error('当前没有可用的 sessionid。')
    return
  }

  loginStep.value = 'profile-loading'
  loginHint.value = '正在完成一键登录，请稍候...'

  try {
    await finishLogin({
      aid: PC_AID,
      sessionid: oneClickSessionId.value,
    })
  } catch (error) {
    loginStep.value = 'error'
    loginHint.value = error?.message || '一键登录失败，请确认汽水音乐 PC 端已登录后重试。'
    message.error(loginHint.value)
    oneClickStep.value = 'idle'
  }
}

watch(
  () => props.show,
  (show) => {
    if (show) {
      detectOneClickLogin()
      return
    }

    resetLoginState()
  },
)
</script>

<template>
  <n-modal
    :show="show"
    :mask-closable="modalClosable"
    :close-on-esc="modalClosable"
    :closable="modalClosable"
    preset="card"
    title="账号登录"
    style="width: 420px;"
    @update:show="(value) => { if (!value) closeModal() }"
  >
    <n-space vertical align="center" justify="center" size="large">
      <n-spin v-if="oneClickStep === 'loading'" size="large">
        <div style="height: 160px; width: 160px;"></div>
      </n-spin>

      <template v-else-if="oneClickStep === 'ready' && oneClickProfile">
        <img
          v-if="oneClickProfile.avatar"
          :src="oneClickProfile.avatar"
          alt="one click profile avatar"
          referrerpolicy="no-referrer"
          style="width: 160px; height: 160px; border-radius: 9999px; object-fit: cover; display: block;"
        />
        <n-avatar v-else round :size="160">
          {{ oneClickProfile.nickname?.slice(0, 1) || 'U' }}
        </n-avatar>

        <n-space vertical align="center" :size="6">
          <n-text strong style="font-size: 18px;">
            {{ oneClickProfile.nickname }}
          </n-text>
          <n-text depth="3">
            {{ oneClickHint }}
          </n-text>
        </n-space>

        <n-button
          type="primary"
          block
          :loading="loginStep === 'profile-loading'"
          @click="submitOneClickLogin"
        >
          一键登录
        </n-button>

        <n-text v-if="loginStep === 'error'" depth="3">
          {{ loginHint }}
        </n-text>
      </template>

      <n-result
        v-else
        status="warning"
        title="当前不支持一键登录"
        :description="oneClickHint || '未检测到可用的本地登录态。'"
      />
    </n-space>
  </n-modal>
</template>
