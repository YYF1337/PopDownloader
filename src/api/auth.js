function getApiErrorMessage(payload, fallbackMessage) {
  return (
    payload?.data?.description ||
    payload?.error ||
    payload?.message ||
    fallbackMessage
  )
}

async function parseApiResponse(response, fallbackMessage) {
  let payload = null

  try {
    payload = await response.json()
  } catch {
    throw new Error(fallbackMessage)
  }

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, fallbackMessage))
  }

  if (payload?.message && payload.message !== 'success') {
    throw new Error(getApiErrorMessage(payload, fallbackMessage))
  }

  if (payload?.data?.error_code && payload.data.error_code !== 0) {
    throw new Error(getApiErrorMessage(payload, fallbackMessage))
  }

  return payload
}

export async function fetchUserProfile(session) {
  const response = await fetch('/api/auth/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(session),
  })

  return parseApiResponse(response, '获取个人信息失败')
}

export async function fetchOneClickLoginSupport() {
  const response = await fetch('/api/auth/one-click-support')
  let payload = null

  try {
    payload = await response.json()
  } catch {
    throw new Error('检测一键登录支持失败')
  }

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || '检测一键登录支持失败')
  }

  return payload
}
