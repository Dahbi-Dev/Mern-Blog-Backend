const mongoose = require("mongoose");
const { model, Schema } = mongoose;

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Check if the model already exists before defining it
const UserModel =
  mongoose.models.User ||
  model(
    "User",
    new Schema(
      {
        username: {
          type: String,
          required: true,
          min: 4,
          unique: true,
        },
        email: {
          type: String,
          required: true,
          unique: true,
          validate: {
            validator: function (v) {
              return emailRegex.test(v);
            },
            message: (props) => `${props.value} is not a valid email address!`,
          },
        },
        password: {
          type: String,
          required: true,
          min: 6,
        },
        isAdmin: {
          type: Boolean,
          default: false,
        },
        resetPasswordToken: {
          type: String,
          default: null,
        },
        resetPasswordExpires: {
          type: Date,
          default: null,
        },
      },
      {
        timestamps: true,
      }
    )
  );

module.exports = UserModel;
