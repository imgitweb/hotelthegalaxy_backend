// scripts/seedDepartments.js
const mongoose = require("mongoose");
const Department = require("../src/models/departmentModel");
require("dotenv").config();
const connect = require("../src/config/db")
const ROLE_MAP = {
  "FRONT OFFICE": ["F.O.M", "F.O.A", "B.Boy"],
  "F&B SERVICE": ["Bar Captain", "Trainee Captain", "Sr Steward", "Steward"],
  KITCHEN: ["Helper", "Tandoor"],
  UTILITY: ["Utility"],
  GUARD: ["Guard"],
  STORE: ["Store"],
  HOUSEKEEPING: ["Room Attendant", "Room Boy", "Linen Man"],
  MAINTENANCE: ["Electrician", "Supervisor", "Maintenance"],
};

async function seed() {
  await connect();
  console.log("Connected to DB");

  for (const [name, roles] of Object.entries(ROLE_MAP)) {
    await Department.findOneAndUpdate(
      { name },
      { name, roles, isActive: true, isDeleted: false },
      { upsert: true, new: true }
    );
    console.log(`✅ Seeded: ${name}`);
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});