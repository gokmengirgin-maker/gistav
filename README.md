# 🛠️ GISTAV AUFMASS PRO v7.0 (ULTIMATE)

[![Status](https://img.shields.io/badge/Status-Premium-gold?style=for-the-badge&logo=appveyor)]()
[![Type](https://img.shields.io/badge/Type-Chrome_Extension-blue?style=for-the-badge&logo=google-chrome)]()

**Gistav Aufmass Pro** is a professional GIS field measurement and reporting assistant designed for telecommunications and construction workers. It automates measurement splitting logic (18m/8m rules) and provides a premium, user-friendly interface for live documentation.

---

## 🔥 Key Features

### 📐 Smart Measurement Logic
- **HA Logic Fix (18m Rule):**
    - Automatically books the first 18m as a **Flatrate (2.2.1)**.
    - Excess distance is automatically calculated and added as a **Zulage (2.2.2)** in meters.
- **SQ Logic Split:**
    - Integrated 8m splitting automation for specialized field tasks.

### 💎 Premium Glassmorphism UI
- **Modern Design:** Sleek Dark Mode with high-tech glassmorphism effects.
- **Floating Panel:** Fully draggable interface (Drag & Drop by header).
- **Live Feedback:** Real-time visual confirmation of current measurement values.

### 📊 Data & Workflow Management
- **Address Navigation:** Load CSV lists and use the "Next Address" feature to auto-search on Gistav.
- **Line Tool Integration:** Direct sync with Gistav Map line tools.
- **Excel Export:** Optimized CSV exports (Semicolon-separated) for instant Excel integration.

---

## 📸 Interface Preview

![Gistav Premium UI Mockup](file:///C:/Users/ggirg/.gemini/antigravity/brain/12eb5d63-4f92-41a9-b2a3-fb9267e7d23a/gistav_premium_ui_mockup_1775540157989.png)

---

## 🚀 Installation

1.  **Download/Clone** this repository to your local machine.
2.  Open **Google Chrome** and navigate to `chrome://extensions/`.
3.  Enable **"Developer mode"** (top right toggle).
4.  Click **"Load unpacked"** and select the root folder of this project.
5.  Launch the extension on any `fiberoptics.cloud` domain.

---

## 📖 How to Use

### 📍 Navigation Tab
1.  Upload your target address CSV.
2.  Use **"NÄCHSTE ADRESSE ANFAHREN"** to find the next job site automatically.

### 📏 Measurement Tab (Messung)
1.  Activate the **Line Tool** on the Gistav Map.
2.  Your measurement will appear **LIVE** in the Floating Panel.
3.  Click **HA** or **SQ** to apply automated splitting logic.
4.  Press **SPEICHERN** to log the data.

### 📤 Data Tab (Daten)
1.  Review your daily logs.
2.  Click **Export CSV** to save your report for Excel processing.

---

## 🛠️ Technical Details
- **Architecture:** Chrome Extension Manifest V3.
- **Backend Sync:** Firestore (if applicable) or LocalStorage for persistence.
- **Frontend:** Vanilla JS / CSS Glassmorphism.

---

© 2026 Gistav Aufmass Assistent Pro. All Rights Reserved.
