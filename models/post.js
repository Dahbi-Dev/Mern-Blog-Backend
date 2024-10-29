const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const PostSchema = new Schema({
    title: String,
    summary: String,
    content: String,
    cover: String,           // URL of the image on Cloudinary
    coverId: String,         // public_id from Cloudinary for deletion
    author: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
});

const PostModel = model('Post', PostSchema);

module.exports = PostModel;
