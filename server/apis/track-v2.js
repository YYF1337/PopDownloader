const { endpoints, fixed, getPcQuery, lunaUserAgent } = require('../config/qishui-auth')
const { buildUrl, probeSessionValidity, signedFetch } = require('../utils/http')

const request = {
  method: 'post',
  path: '/api/track/v2',
  query: {
    aid: fixed.aid,
  },
  headers: {
    'content-type': 'application/json; charset=utf-8',
  },
  body: {
    aid: fixed.aid,
    sessionid: 'string',
    track_id: 'string',
    media_type: 'track',
    queue_type: 'search_one_track',
    scene_name: 'search',
  },
}

const response = {
  track: {
    id: 'string',
    name: 'string',
  },
  track_player: {
    video_model: 'string',
  },
}

module.exports = {
  name: 'track-v2',
  method: request.method,
  path: request.path,
  request,
  response,
  handler: async (req, res) => {
    const {
      aid = fixed.aid,
      sessionid,
      track_id,
      media_type = 'track',
      queue_type = 'search_one_track',
      scene_name = 'search',
    } = req.body || {}

    if (!sessionid) {
      res.status(400).json({
        message: 'sessionid is required',
      })
      return
    }

    if (!track_id) {
      res.status(400).json({
        message: 'track_id is required',
      })
      return
    }

    try {
      const target = buildUrl(endpoints.trackV2, getPcQuery({ aid }))
      const upstream = await signedFetch(target, {
        method: 'POST',
        headers: {
          Cookie: `sessionid=${sessionid};`,
          'Content-Type': request.headers['content-type'],
          'User-Agent': lunaUserAgent,
        },
        body: JSON.stringify({
          track_id,
          media_type,
          queue_type,
          scene_name,
        }),
      })

      const rawText = await upstream.text()
      if (!rawText) {
        const sessionValid = await probeSessionValidity({ aid, sessionid })
        res.status(502).json({
          message: 'failed',
          error: sessionValid
            ? `upstream returned empty body with status ${upstream.status} (session is valid, track_v2 may be blocked by risk control)`
            : 'session is invalid or expired, please log in again',
          session_valid: sessionValid,
        })
        return
      }

      let payload
      try {
        payload = JSON.parse(rawText)
      } catch {
        res.status(502).json({
          message: 'failed',
          error: 'upstream response is not valid JSON',
        })
        return
      }

      res.status(upstream.status).json(payload)
    } catch (error) {
      res.status(500).json({
        message: 'failed',
        error: error.message,
      })
    }
  },
}
