// require("dotenv").config();
// const connectDB = require("./src/config/db");
// const Admin = require("./src/models/Admin");

// const seedAdmin = async () => {
//   try {
//     console.log("🚀 Starting Admin Seeder...");

//     await connectDB();
//     console.log("🟢 MongoDB connected");

//     const adminEmail = process.env.SEED_ADMIN_EMAIL;
//     const adminPassword = process.env.SEED_ADMIN_PASSWORD;

//     if (!adminEmail || !adminPassword) {
//       throw new Error(
//         "SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD missing in .env"
//       );
//     }

//     const existingAdmin = await Admin.findOne({ email: adminEmail });

//     if (existingAdmin) {
//       console.log("⚠️ Admin already exists");
//       process.exit(0);
//     }

//     await Admin.create({
//       email: adminEmail,
//       password: adminPassword, // Will auto-hash
//       role: "admin",
//     });

//     console.log("✅ Admin created successfully");
//     console.log("📧 Email:", adminEmail);

//     process.exit(0);
//   } catch (error) {
//     console.error("❌ Admin seeding failed");
//     console.error(error.message);
//     process.exit(1);
//   }
// };


// seedAdmin();


require("dotenv").config();
const connectDB = require("./src/config/db");
const Admin = require("./src/models/Admin");

const seedUsers = async () => {
  try {
    console.log("🚀 Starting Seeder...");

    await connectDB();
    console.log("🟢 MongoDB connected");

    const adminEmail = process.env.SEED_ADMIN_EMAIL;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;

    const managerEmail = process.env.SEED_MANAGER_EMAIL;
    const managerPassword = process.env.SEED_MANAGER_PASSWORD;

    if (!adminEmail || !adminPassword) {
      throw new Error("Admin credentials missing in .env");
    }

   
    const existingAdmin = await Admin.findOne({ email: adminEmail });

    if (!existingAdmin) {
      await Admin.create({
        email: adminEmail,
        password: adminPassword,
        role: "admin",
      });

      console.log("✅ Admin created");
    } else {
      console.log("⚠️ Admin already exists");
    }

   
    if (managerEmail && managerPassword) {
      const existingManager = await Admin.findOne({ role: "manager" });

      if (!existingManager) {
        await Admin.create({
          email: managerEmail,
          password: managerPassword,
          role: "manager",
        });

        console.log("✅ Manager created");
      } else {
        console.log("⚠️ Manager already exists");
      }
    }

    console.log("🎉 Seeding complete");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed");
    console.error(error.message);
    process.exit(1);
  }
};

seedUsers();