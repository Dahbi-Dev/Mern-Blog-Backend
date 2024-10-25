const mongoose = require("mongoose");


const ReactionSchema = new mongoose.Schema({
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'dislike', 'love', 'fire'], required: true }
  }, {
    timestamps: true
  });
  
  // Ensure one reaction per user per post
  ReactionSchema.index({ post: 1, user: 1 }, { unique: true });
  
  module.exports = mongoose.model('Reaction', ReactionSchema);