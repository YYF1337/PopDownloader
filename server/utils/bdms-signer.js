const { getInstall, getOfficialDevice } = require('./soda-install')

let bdmsModule = null

function loadBdms() {
  if (bdmsModule) {
    return bdmsModule
  }

  const install = getInstall()

  if (!install.found) {
    throw new Error('未找到汽水音乐 PC 端安装目录，无法加载 bdms 签名模块')
  }

  try {
    bdmsModule = require(install.bdmsNodePath)
  } catch (error) {
    throw new Error(`加载 bdms 签名模块失败（${install.bdmsNodePath}）：${error.message}`)
  }

  return bdmsModule
}

let initialized = false

function ensureInit() {
  if (initialized) {
    return
  }

  const bdms = loadBdms()
  const device = getOfficialDevice()
  bdms.init({ deviceId: device.did })
  initialized = true
}

function generateSignatureHeaders(url, headers) {
  ensureInit()

  const headerLines = []
  for (const [key, value] of Object.entries(headers)) {
    headerLines.push(`${key}\r\n${value}`)
  }

  const bdms = loadBdms()
  const raw = String(bdms.generateHttpSignatureHeaders(url, headerLines.join('\r\n')))
  const parts = raw.split('\r\n').filter((t) => t.trim())
  const signed = {}

  for (let i = 0; i < parts.length / 2; i += 1) {
    signed[parts[i * 2]] = parts[i * 2 + 1]
  }

  return signed
}

async function signedFetch(url, options = {}) {
  const { headers = {}, ...rest } = options
  const flatHeaders = {}

  for (const [key, value] of Object.entries(headers)) {
    flatHeaders[key.toLowerCase()] = Array.isArray(value) ? value[0] : String(value)
  }

  const signatureHeaders = generateSignatureHeaders(url, flatHeaders)

  return fetch(url, {
    ...rest,
    headers: { ...flatHeaders, ...signatureHeaders },
  })
}

module.exports = {
  generateSignatureHeaders,
  signedFetch,
}
