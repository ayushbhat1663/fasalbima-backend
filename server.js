const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// middleware
app.use(cors());
app.use(express.json());
app.use(express.static("code"));

// ===== AUTH ROUTES =====
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// ===== CLAIM ROUTES =====
const claimRoutes = require('./routes/claim');
app.use('/api/claim', claimRoutes);

// ===== ROOT ROUTE =====
app.get("/", (req, res) => {
  res.send("Backend is running");
});

// ===== SERVER START =====
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("🚀 FasalBima Backend Started");
});