// const mongoose = require('mongoose');
// const { model, Schema } = mongoose;

// const UserSchema = new Schema({
//   username: {
//     type: String,
//     required: true,
//     min: 4,
//     unique: true
//   },
//   password: {
//     type: String,
//     required: true
//   }
// });

// const UserModel = model('User', UserSchema);
// module.exports = UserModel;


const mongoose = require('mongoose');
const { model, Schema } = mongoose;

// Check if the model already exists before defining it
const UserModel = mongoose.models.User || model('User', new Schema({
  username: {
    type: String,
    required: true,
    min: 4,
    unique: true
  },
  password: {
    type: String,
    required: true
  }
}));

module.exports = UserModel;
