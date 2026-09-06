const { probeEnvironment } = require('../utils/soda-install')

module.exports = {
  name: 'environment',
  method: 'get',
  path: '/api/environment',
  handler: async (_req, res) => {
    try {
      res.json({
        message: 'success',
        data: probeEnvironment(),
      })
    } catch (error) {
      res.status(500).json({
        message: 'failed',
        error: error.message,
      })
    }
  },
}
