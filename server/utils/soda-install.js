const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')

const DEVICE_V1_PATH = path.join(os.homedir(), 'AppData', 'Roaming', 'SodaMusic', 'DeviceV1')
const FALLBACK_DEVICE = { did: '1342943657463593', iid: '516125126358890' }

function collectCandidateRoots() {
  const roots = []

  if (process.env.SODA_MUSIC_HOME) {
    roots.push(process.env.SODA_MUSIC_HOME)
  }

  for (let code = 67; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`
    try {
      if (fs.existsSync(drive)) {
        roots.push(path.join(drive, 'Soda Music'))
      }
    } catch {}
  }

  roots.push(
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Soda Music'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Soda Music'),
    path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Soda Music'),
    path.join(os.homedir(), 'AppData', 'Local', 'Soda Music'),
  )

  return roots
}

function compareVersionDesc(a, b) {
  const pa = String(a).split('.').map((t) => Number.parseInt(t, 10) || 0)
  const pb = String(b).split('.').map((t) => Number.parseInt(t, 10) || 0)
  const len = Math.max(pa.length, pb.length)

  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) {
      return -diff
    }
  }

  return 0
}

function findInstall() {
  for (const root of collectCandidateRoots()) {
    let entries = []

    try {
      entries = fs.readdirSync(root, { withFileTypes: true })
    } catch {
      continue
    }

    const versionDirs = entries
      .filter((item) => item.isDirectory() && /^\d+(\.\d+)+$/.test(item.name))
      .map((item) => item.name)
      .sort(compareVersionDesc)

    for (const version of versionDirs) {
      const bdmsNodePath = path.join(root, version, 'resources', 'app.asar.unpacked', 'bdms.node')

      if (fs.existsSync(bdmsNodePath)) {
        return {
          found: true,
          root,
          version,
          bdmsNodePath,
        }
      }
    }
  }

  return {
    found: false,
    root: '',
    version: '',
    bdmsNodePath: '',
  }
}

function decodeDeviceV1() {
  try {
    const buf = fs.readFileSync(DEVICE_V1_PATH)
    const data = JSON.parse(zlib.gunzipSync(buf).toString())
    if (data?.did && data?.iid) {
      return { did: String(data.did), iid: String(data.iid), source: DEVICE_V1_PATH }
    }
  } catch {}

  return { ...FALLBACK_DEVICE, source: 'fallback' }
}

let cachedInstall = null
let cachedDevice = null

function getInstall() {
  if (!cachedInstall) {
    cachedInstall = findInstall()
  }
  return cachedInstall
}

function getOfficialDevice() {
  if (!cachedDevice) {
    cachedDevice = decodeDeviceV1()
  }
  return cachedDevice
}

function probeEnvironment() {
  const install = getInstall()
  const device = getOfficialDevice()

  return {
    platform: `${os.type()} ${os.release()}`,
    node_version: process.version,
    soda_install: {
      found: install.found,
      root: install.root,
      version: install.version,
      bdms_node_path: install.bdmsNodePath,
    },
    device_v1: {
      found: device.source === DEVICE_V1_PATH,
      path: DEVICE_V1_PATH,
      did: device.did,
      iid: device.iid,
      source: device.source,
    },
  }
}

module.exports = {
  DEVICE_V1_PATH,
  getInstall,
  getOfficialDevice,
  probeEnvironment,
}
