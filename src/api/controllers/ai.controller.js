const aiService = require('../../services/ai.service');
const UsageService = require('../../services/usage.service');

exports.chat = async (req, res) => {
  try {
    const { message, history } = req.body;
    const userId = req.user.id;
    
    if (!message) {
      return res.status(400).json({ message: 'Message is required' });
    }

    // Check usage limit for FREE tier
    const canAsk = await UsageService.canAskAi(userId);
    if (!canAsk.allowed) {
      return res.status(403).json({ message: canAsk.message, limitReached: true });
    }
    
    const response = await aiService.chat(userId, message, history);

    // Log AI usage
    await UsageService.logAiUsage(userId, message, true);
    await UsageService.logAiUsage(userId, JSON.stringify(response), false);

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
