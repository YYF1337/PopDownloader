const { Readable } = require('stream')
const archiver = require('archiver')
const { downloadTrackMedia } = require('../utils/track-download')
const { fetchVideoStream } = require('../utils/video-download')
const { VideoAudioExtractor } = require('../utils/video-audio-extractor')
const {
  createBatchProgress,
  deleteBatchProgress,
  updateBatchProgress,
} = require('../utils/batch-progress-store')

const request = {
  method: 'post',
  path: '/api/playlist/batch-download',
  headers: {
    'content-type': 'application/json; charset=utf-8',
  },
  body: {
    sessionid: 'string',
    playlist_title: 'string?',
    batch_id: 'string?',
    tasks: 'array',
  },
}

function sanitizeFilename(fileName, fallback = 'file') {
  const baseName = String(fileName || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim()

  return baseName || fallback
}

function appendToArchive(archive, input, name) {
  return new Promise((resolve, reject) => {
    const handleEntry = (entry) => {
      if (entry?.name !== name) {
        return
      }

      cleanup()
      resolve()
    }

    const handleError = (error) => {
      cleanup()
      reject(error)
    }

    const cleanup = () => {
      archive.off('entry', handleEntry)
      archive.off('error', handleError)
    }

    archive.on('entry', handleEntry)
    archive.on('error', handleError)
    archive.append(input, { name })
  })
}

module.exports = {
  name: 'playlist-batch-download',
  method: request.method,
  path: request.path,
  request,
  response: {},
  handler: async (req, res) => {
    const { sessionid, playlist_title, tasks, batch_id } = req.body || {}

    if (!sessionid) {
      res.status(400).json({
        message: 'sessionid is required',
      })
      return
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
      res.status(400).json({
        message: 'tasks is required',
      })
      return
    }

    const zipName = `${sanitizeFilename(playlist_title || 'playlist-batch-download')}.zip`
    const archive = archiver('zip', { zlib: { level: 9 } })
    const batchId = String(batch_id || '').trim()

    archive.on('error', (error) => {
      if (batchId) {
        updateBatchProgress(batchId, {
          status: 'failed',
          error: error.message,
        })
      }

      if (!res.headersSent) {
        res.status(500).json({
          message: 'failed',
          error: error.message,
        })
        return
      }

      res.destroy(error)
    })

    if (batchId) {
      createBatchProgress(batchId, tasks.length)
    }

    // 失败隔离：单个任务失败最多重试 3 次，仍失败则只记录错误并跳过，
    // 避免因个别曲目（如 VIP 锁定、地区限制、风控）失败而毁掉整包下载。
    const MAX_ATTEMPTS = 3
    const failedErrors = []
    let succeeded = 0
    let streamReady = false

    const ensureStream = () => {
      if (streamReady) {
        return
      }

      streamReady = true
      res.setHeader('Content-Type', 'application/zip')
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`)
      archive.pipe(res)
    }

    // 下载/转换阶段可重试：返回待写入的压缩包条目；此时尚未写入任何 zip 字节。
    const buildEntry = async (task, fallbackPrefix) => {
      if (task?.action === 'audio') {
        const result = await downloadTrackMedia({
          sessionid,
          track_id: task.trackId,
          quality: task.quality,
        })
        return {
          input: result.buffer,
          name: sanitizeFilename(task.fileName || result.fileName || `${fallbackPrefix}.bin`),
        }
      }

      if (task?.action === 'video') {
        const upstream = await fetchVideoStream(task.downloadUrl)
        return {
          input: Readable.fromWeb(upstream.body),
          name: sanitizeFilename(task.fileName || `${fallbackPrefix}.mp4`),
        }
      }

      if (task?.action === 'video-audio') {
        const extractor = new VideoAudioExtractor()
        const result = await extractor.extractMp3FromVideoUrl(task.downloadUrl, {
          baseName: sanitizeFilename(task.title || fallbackPrefix),
        })
        return {
          input: result.buffer,
          name: sanitizeFilename(task.fileName || `${fallbackPrefix}.mp3`),
        }
      }

      return null
    }

    const reportProgress = () => {
      if (!batchId) {
        return
      }

      updateBatchProgress(batchId, {
        completed: succeeded,
        failed: failedErrors.length,
        errors: failedErrors.slice(),
      })
    }

    try {
      for (let index = 0; index < tasks.length; index += 1) {
        const task = tasks[index]
        const fallbackPrefix = `${String(index + 1).padStart(3, '0')}-${sanitizeFilename(task?.title || 'file')}`
        let lastError = null
        let entry = null

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
          try {
            entry = await buildEntry(task, fallbackPrefix)
            lastError = null
            break
          } catch (taskError) {
            lastError = taskError
          }
        }

        if (!entry || lastError) {
          failedErrors.push({
            index,
            title: task?.title || `${fallbackPrefix}`,
            message: lastError?.message || '下载失败',
          })
          reportProgress()
          continue
        }

        ensureStream()
        await appendToArchive(archive, entry.input, entry.name)
        succeeded += 1
        reportProgress()
      }

      if (succeeded === 0) {
        if (batchId) {
          updateBatchProgress(batchId, {
            status: 'failed',
            failed: failedErrors.length,
            errors: failedErrors.slice(),
            error: '全部任务下载失败',
          })
          setTimeout(() => {
            deleteBatchProgress(batchId)
          }, 5 * 60 * 1000)
        }

        res.status(400).json({
          message: 'failed',
          error: '全部任务下载失败',
          errors: failedErrors,
        })
        return
      }

      await archive.finalize()
      if (batchId) {
        updateBatchProgress(batchId, {
          completed: succeeded,
          failed: failedErrors.length,
          errors: failedErrors.slice(),
          status: 'completed',
        })
        setTimeout(() => {
          deleteBatchProgress(batchId)
        }, 5 * 60 * 1000)
      }
    } catch (error) {
      archive.destroy()

      if (batchId) {
        updateBatchProgress(batchId, {
          status: 'failed',
          error: error.message,
        })
        setTimeout(() => {
          deleteBatchProgress(batchId)
        }, 5 * 60 * 1000)
      }

      if (!res.headersSent) {
        res.status(error.status || 500).json({
          message: 'failed',
          error: error.message,
        })
        return
      }

      res.destroy(error)
    }
  },
}
