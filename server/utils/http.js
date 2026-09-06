const { endpoints, fixed, getPcQuery, lunaUserAgent } = require('../config/qishui-auth')
const { signedFetch } = require('./bdms-signer')

function buildUrl(url, query = {}) {
  const target = new URL(url)

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      target.searchParams.set(key, value)
    }
  }

  return target.toString()
}

function getSessionIdFromSetCookie(headers) {
  const cookies =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie')
        ? [headers.get('set-cookie')]
        : []

  for (const item of cookies) {
    const match = item.match(/sessionid=([^;]+)/)
    if (match) {
      return match[1]
    }
  }

  return ''
}

async function probeSessionValidity({ aid = fixed.aid, sessionid }) {
  if (!sessionid) {
    return false
  }

  try {
    const target = buildUrl(endpoints.me, getPcQuery({ aid }))
    const upstream = await signedFetch(target, {
      headers: {
        Cookie: `sessionid=${sessionid};`,
        'User-Agent': lunaUserAgent,
      },
    })

    const payload = await upstream.json()
    return payload?.status_code === 0
  } catch {
    return null
  }
}

module.exports = {
  buildUrl,
  getSessionIdFromSetCookie,
  probeSessionValidity,
  signedFetch,
}
