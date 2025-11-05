const mongoose = require('mongoose');

const COLLECTION_NAME = process.env.COLLECTION_NAME || 'users';

const UserSchema = new mongoose.Schema({
  fullName: { type: String },
  doctorId: { type: String },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  hospitalName: { type: String },
  area: { type: String },
  profilePicture: { type: String }, // base64 encoded image
}, { timestamps: true, collection: COLLECTION_NAME });

// Prevent model overwrite issues in server restarts
const User = mongoose.models.User || mongoose.model('User', UserSchema);
module.exports = User;
