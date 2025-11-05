require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const User = require("./models/User");
const Analysis = require("./models/Analysis");

const app = express();

// ========================
// ✅ CORS Configuration
// ========================
const allowedOrigins = [
  "https://cnd-project-frontend.onrender.com",
  "http://localhost:3000"
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());

// ========================
// ✅ MongoDB Connection
// ========================
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const JWT_SECRET = process.env.JWT_SECRET;
const USE_JWT = !!JWT_SECRET;

const mongooseOptions = { useNewUrlParser: true, useUnifiedTopology: true };
if (DB_NAME) mongooseOptions.dbName = DB_NAME;

mongoose
  .connect(MONGO_URI, mongooseOptions)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ========================
// ✅ Auth Routes
// ========================

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { fullName, doctorId, email, password, hospitalName, area } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: "User already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ fullName, doctorId, email, passwordHash: hashed, hospitalName, area });
    await user.save();

    if (USE_JWT) {
      const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
      res.cookie("token", token, {
        httpOnly: true,
        secure: true, // for HTTPS
        sameSite: "none", // required for Render
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.json({ user: { id: user._id, email: user.email, fullName: user.fullName } });
    } else {
      res.cookie("user_email", user.email, { httpOnly: false, sameSite: "lax" });
      return res.json({ user: { id: user._id, email: user.email, fullName: user.fullName } });
    }
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

    if (USE_JWT) {
      const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return res.json({ user: { id: user._id, email: user.email, fullName: user.fullName } });
    } else {
      res.cookie("user_email", user.email, { httpOnly: false, sameSite: "lax" });
      return res.json({ user: { id: user._id, email: user.email, fullName: user.fullName } });
    }
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Current User
app.get("/api/auth/me", async (req, res) => {
  try {
    let user;
    if (USE_JWT) {
      const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).json({ message: "Not authenticated" });
      const decoded = jwt.verify(token, JWT_SECRET);
      user = await User.findById(decoded.id).select("-passwordHash");
    } else {
      const email = req.cookies.user_email || req.headers["x-user-email"];
      if (!email) return res.status(401).json({ message: "Not authenticated" });
      user = await User.findOne({ email }).select("-passwordHash");
    }

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    console.error("Auth/me error:", err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  try {
    res.clearCookie("token", { sameSite: "none", secure: true });
    res.clearCookie("user_email");
    res.json({ ok: true });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Logout failed" });
  }
});

// ========================
// ✅ Profile Routes
// ========================
app.get("/api/profile", async (req, res) => {
  try {
    let user;
    if (USE_JWT) {
      const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
      if (!token) return res.status(401).json({ message: "Not authenticated" });
      const decoded = jwt.verify(token, JWT_SECRET);
      user = await User.findById(decoded.id).select("-passwordHash");
    } else {
      const email = req.cookies.user_email || req.headers["x-user-email"];
      if (!email) return res.status(401).json({ message: "Not authenticated" });
      user = await User.findOne({ email }).select("-passwordHash");
    }

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      full_name: user.fullName || "",
      doctor_id: user.doctorId || "",
      email: user.email || "",
      hospital_name: user.hospitalName || "",
      area: user.area || "",
      profile_picture: user.profilePicture || "",
    });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ========================
// ✅ Analysis Routes
// ========================
app.get("/api/analysis/category-counts", async (req, res) => {
  try {
    const totalCount = await Analysis.countDocuments();
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayCount = await Analysis.countDocuments({ createdAt: { $gte: last24h } });
    const cancerCount = await Analysis.countDocuments({
      "results.diagnosis": { $regex: /Cancer|Benign|Malignant|Normal/i },
    });
    const neuroCount = await Analysis.countDocuments({
      "results.diagnosis": { $regex: /Seizure|MS|Alzheimer|Control/i },
    });

    res.json({ todayCount, totalCount, cancerCount, neuroCount });
  } catch (err) {
    console.error("Category counts error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/analysis/history", async (req, res) => {
  try {
    const analyses = await Analysis.find().sort({ createdAt: -1 });
    res.json(analyses);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ========================
// ✅ Health Check
// ========================
app.get("/", (req, res) => res.send("✅ MedAI backend running successfully"));

// ========================
// ✅ Start Server
// ========================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
